/**
 * `holocron notifications setup` — apply the server layout a `notifications`
 * provider declares in `holocron.config.ts` (categories, channels, roles, and
 * a webhook secret per channel that asks for one).
 *
 * Idempotent: every step looks things up by name and creates only what is
 * missing, so it is safe to re-run and `--dry-run` previews it. A failing step
 * is reported and the rest still run.
 *
 * Run it from ONE repo per server — a layout is org-level, and putting it in a
 * shared preset would apply it from every repo.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Secrets } from "../../plugin/index.js";
import { describeProviderError } from "../../ui/provider-error/index.js";
import {
	assertSecretsReachable,
	defaultSecretName,
	pickProvisioner,
	provisionChannel,
	whyMissing,
} from "../notifications-channel-add/index.js";
import type { NotificationsSetupReport, RoleOutcome, RunNotificationsSetupInput } from "./notifications-setup.type.js";

export async function runNotificationsSetup(input: RunNotificationsSetupInput): Promise<NotificationsSetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications setup");

	const dryRun = input.context.dryRun ?? false;
	const report: NotificationsSetupReport = { status: "ok", categories: [], channels: [], roles: [], failures: [] };

	// A precondition failure is printed and returned, never thrown: the CLI's
	// global handler swallows a plain Error, so a bare throw would exit 1 silently.
	const refuse = (message: string): NotificationsSetupReport => {
		print(`  ✗ ${message}`);
		logger.warn({ reason: message }, "notifications setup");
		return { ...report, status: "fail", message };
	};

	let notifications;
	try {
		notifications = pickProvisioner(loader.has("notifications") ? loader.get("notifications") : [], input.provider);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	const layout = notifications.layout;
	if (!layout) {
		return refuse(
			`the \`${notifications.providerName}\` provider declares no layout — add \`layout\` to its options in holocron.config.ts`
		);
	}

	const wantsWebhook = (layout.categories ?? []).some((c) => (c.channels ?? []).some((ch) => ch.webhook));
	let secrets: Secrets | undefined;
	// A dry-run stores nothing, so it needs no credentials for the secrets provider.
	if (wantsWebhook && !dryRun) {
		if (!loader.has("secrets")) {
			return refuse(
				whyMissing(
					loader,
					"secrets",
					"the layout asks for webhooks, which need a `secrets` capability — add a `secrets` provider"
				)
			);
		}
		secrets = loader.get("secrets") as Secrets;
	}
	const org = input.context.org;
	const scope = input.scope ?? (org ? ({ kind: "organization", name: org } as const) : undefined);
	if (wantsWebhook && !scope && !dryRun) {
		return refuse("no org to store webhook secrets under — pass --scope or set `org` in holocron.config.ts");
	}

	// Webhook URLs are shown once, so prove the secrets store is reachable BEFORE
	// creating any webhook, instead of leaving an orphan per channel on a bad token.
	if (secrets && scope && !dryRun) {
		try {
			await assertSecretsReachable(secrets, scope);
		} catch (err) {
			return refuse(errorMessage(err));
		}
	}

	// Two webhooks cannot share one secret: the second would overwrite the first and
	// callers would post to the wrong channel. Normalising punctuation makes that
	// easy to hit by accident (release-notes vs release_notes), so refuse up front.
	const taken = new Map<string, string>();
	for (const category of layout.categories ?? []) {
		for (const channel of category.channels ?? []) {
			if (!channel.webhook) continue;
			const secret = (channel.webhook !== true && channel.webhook.secret) || defaultSecretName(channel.name);
			const other = taken.get(secret);
			if (other) {
				return refuse(
					`channels \`${other}\` and \`${channel.name}\` would both store their webhook in ${secret} — give one a distinct \`webhook.secret\``
				);
			}
			taken.set(secret, channel.name);
		}
	}

	print(`Holocron notifications setup — ${notifications.providerName}${dryRun ? " (dry-run)" : ""}`);

	const attempt = async (step: string, fn: () => Promise<void>) => {
		try {
			await fn();
		} catch (err) {
			const message = describeProviderError(err);
			print(`  ✗ ${step}: ${message}`);
			report.failures.push({ step, message });
		}
	};

	for (const category of layout.categories ?? []) {
		print(`\n${category.name}`);
		report.categories.push(category.name);
		await attempt(`category ${category.name}`, async () => {
			if (!notifications.ensureCategory) return; // the provider has no categories; channels simply go ungrouped
			if (dryRun) {
				print(`  … would ensure category ${category.name}`);
				return;
			}
			const made = await notifications.ensureCategory(category.name);
			print(`  ${made.created ? "✓ created" : "· exists "} category ${category.name}`);
		});
		for (const channel of category.channels ?? []) {
			await attempt(`channel ${channel.name}`, async () => {
				const outcome = await provisionChannel(
					{ notifications, ...(secrets ? { secrets } : {}), scope: scope ?? { kind: "repo" }, dryRun, print },
					{
						name: channel.name,
						category: category.name,
						...(channel.topic ? { topic: channel.topic } : {}),
						...(channel.webhook ? { webhook: channel.webhook === true ? {} : channel.webhook } : {}),
					}
				);
				report.channels.push(outcome);
				if (outcome.webhook && !outcome.webhook.stored) {
					report.failures.push({
						step: `webhook ${outcome.webhook.name}`,
						message: outcome.webhook.note!,
					});
				}
			});
		}
	}

	if ((layout.roles ?? []).length > 0) print("\nRoles");
	for (const role of layout.roles ?? []) {
		await attempt(`role ${role.name}`, async () => {
			if (!notifications.ensureRole) throw new Error(`\`${notifications.providerName}\` cannot manage roles`);
			if (dryRun) {
				print(`  … would ensure role ${role.name}`);
				report.roles.push({ name: role.name, created: false });
				return;
			}
			const made = await notifications.ensureRole({
				name: role.name,
				...(role.mentionable !== undefined ? { mentionable: role.mentionable } : {}),
			});
			const outcome: RoleOutcome = { name: role.name, id: made.id, created: made.created };
			report.roles.push(outcome);
			print(`  ${made.created ? "✓ created" : "· exists "} role ${role.name} (id ${made.id})`);
		});
	}

	if (report.failures.length > 0) {
		report.status = "fail";
		print(`\n${report.failures.length} step(s) need attention`);
	} else if (dryRun) {
		report.status = "dry-run";
	}
	logger.info(
		{
			provider: notifications.providerName,
			channels: report.channels.length,
			roles: report.roles.length,
			failures: report.failures.length,
			status: report.status,
		},
		"notifications setup"
	);
	return report;
}
