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
import {
	assertPluginsResolvable,
	type NotificationsAccess,
	type NotificationsLayout,
	PluginLoader,
	type Secrets,
} from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import {
	assertSecretsReachable,
	layoutSecretProblem,
	notificationProviders,
	pickProvisioner,
	provisionChannel,
	whyMissing,
} from "../notifications-channel-add/index.js";
import type { NotificationsSetupReport, RoleOutcome, RunNotificationsSetupInput } from "./notifications-setup.type.js";

/** A channel's access: its category's, with any field the channel states itself laid over it. */
export function effectiveAccess(
	category: NotificationsAccess | undefined,
	channel: NotificationsAccess | undefined
): NotificationsAccess | undefined {
	if (!category && !channel) return undefined;
	return { ...category, ...channel };
}

/** The first role an `access` names that the layout does not declare, or undefined. */
export function accessRoleProblem(layout: NotificationsLayout): string | undefined {
	const declared = new Set((layout.roles ?? []).map((r) => r.name.toLowerCase()));
	const check = (where: string, access: NotificationsAccess | undefined): string | undefined => {
		for (const field of ["view", "post"] as const) {
			const value = access?.[field];
			if (!Array.isArray(value)) continue;
			const unknown = value.find((name) => !declared.has(name.toLowerCase()));
			if (unknown !== undefined) {
				return `${where}: \`access.${field}\` names the role \`${unknown}\`, which is not in the layout's roles`;
			}
		}
		return undefined;
	};
	for (const category of layout.categories ?? []) {
		const problem = check(`category \`${category.name}\``, category.access);
		if (problem) return problem;
		for (const channel of category.channels ?? []) {
			const found = check(`channel \`${channel.name}\``, channel.access);
			if (found) return found;
		}
	}
	return undefined;
}

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
	const refuse = (message: string, reason: string = message): NotificationsSetupReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "notifications setup");
		return { ...report, status: "fail", message };
	};

	let notifications;
	try {
		notifications = pickProvisioner(notificationProviders(loader), input.provider);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	const layout = notifications.layout;
	if (!layout) {
		return refuse(
			`the \`${notifications.providerName}\` provider declares no layout — add \`layout\` to its options in holocron.config.ts`
		);
	}

	// Anything that writes a secret: a channel's webhook URL, or a role's id.
	const wantsWebhook = (layout.categories ?? []).some((c) => (c.channels ?? []).some((ch) => ch.webhook));
	const wantsSecrets = wantsWebhook || (layout.roles ?? []).some((r) => r.secret);
	let secrets: Secrets | undefined;
	// A dry-run stores nothing, so it needs no credentials for the secrets provider.
	if (wantsSecrets && !dryRun) {
		if (!loader.has("secrets")) {
			return refuse(
				whyMissing(
					loader,
					"secrets",
					"the layout stores webhook URLs or role ids, which need a `secrets` capability — add a `secrets` provider"
				)
			);
		}
		secrets = loader.get("secrets") as Secrets;
	}
	const org = input.context.org;
	const scope = input.scope ?? (org ? ({ kind: "organization", name: org } as const) : undefined);
	if (wantsSecrets && !scope && !dryRun) {
		return refuse("no org to store secrets under — pass --scope or set `org` in holocron.config.ts");
	}

	// Webhook URLs are shown once, so prove the secrets store is reachable BEFORE
	// creating any webhook, instead of leaving an orphan per channel on a bad token.
	if (secrets && scope && !dryRun) {
		try {
			await assertSecretsReachable(secrets, scope);
		} catch (err) {
			return refuse(errorMessage(err), logReason(err));
		}
	}

	// Refuse a layout whose secret names would collide, or that the provider cannot apply,
	// before anything is created: a half-applied layout is harder to reason about than none.
	const secretProblem = layoutSecretProblem(layout);
	if (secretProblem) return refuse(secretProblem);
	const accessProblem = accessRoleProblem(layout);
	if (accessProblem) return refuse(accessProblem);
	const providerProblem = notifications.validateLayout?.(layout);
	if (providerProblem) return refuse(providerProblem);

	// Tallied for the closing summary: made or stored (ok), already there or only previewed (skip), failed (fail).
	const tally = { ok: 0, skip: 0 };
	const made = (created: boolean) => void (created ? tally.ok++ : tally.skip++);

	const attempt = async (step: string, fn: () => Promise<void>) => {
		try {
			await fn();
		} catch (err) {
			const message = describeProviderError(err);
			print(`  ${style.fail(`${step}: ${message}`)}`);
			report.failures.push({ step, message });
		}
	};

	// Roles first: a channel's access names them, and the server has to have them by then.
	if ((layout.roles ?? []).length > 0) print(`\n${style.header("Roles")}`);
	for (const role of layout.roles ?? []) {
		await attempt(`role ${role.name}`, async () => {
			if (!notifications.ensureRole) throw new Error(`\`${notifications.providerName}\` cannot manage roles`);
			if (dryRun) {
				print(
					`  ${style.skip(`would ensure role ${role.name}${role.secret ? ` and store its id in ${role.secret}` : ""}`)}`
				);
				tally.skip++;
				report.roles.push({ name: role.name, created: false, ...(role.secret ? { secret: role.secret } : {}) });
				return;
			}
			const result = await notifications.ensureRole({
				name: role.name,
				...(role.mentionable !== undefined ? { mentionable: role.mentionable } : {}),
				...(role.color !== undefined ? { color: role.color } : {}),
				...(role.hoist !== undefined ? { hoist: role.hoist } : {}),
				...(role.permissions !== undefined ? { permissions: role.permissions } : {}),
			});
			const outcome: RoleOutcome = {
				name: role.name,
				id: result.id,
				created: result.created,
				...(result.updated?.length ? { updated: result.updated } : {}),
			};
			report.roles.push(outcome);
			const changed = result.created || (result.updated?.length ?? 0) > 0;
			const verb = result.created ? "created" : changed ? "updated" : "exists ";
			print(
				`  ${(changed ? style.success : style.skip)(`${verb} role ${role.name} (id ${result.id})${result.updated?.length ? `: ${result.updated.join(", ")}` : ""}`)}`
			);
			made(changed);
			if (role.secret) {
				// Same store as the webhooks, so the id is there for workflows with nothing to copy by hand.
				await secrets!.setSecret(scope!, role.secret, result.id); // set: setup refuses to run without both
				outcome.secret = role.secret;
				outcome.stored = true;
				print(`  ${style.success(`stored the id of ${role.name} in ${role.secret}`)}`);
				tally.ok++;
			}
		});
	}

	for (const category of layout.categories ?? []) {
		print(`\n${style.header(category.name)}`);
		report.categories.push(category.name);
		await attempt(`category ${category.name}`, async () => {
			if (!notifications.ensureCategory) return; // the provider has no categories; channels simply go ungrouped
			if (dryRun) {
				print(`  ${style.skip(`would ensure category ${category.name}`)}`);
				tally.skip++;
				return;
			}
			const result = await notifications.ensureCategory(category.name, {
				...(category.access ? { access: category.access } : {}),
			});
			const changed = result.created || (result.updated?.length ?? 0) > 0;
			const verb = result.created ? "created" : changed ? "updated" : "exists ";
			const what = result.updated?.length ? `: ${result.updated.join(", ")}` : "";
			print(`  ${(changed ? style.success : style.skip)(`${verb} category ${category.name}${what}`)}`);
			made(changed);
		});
		for (const channel of category.channels ?? []) {
			await attempt(`channel ${channel.name}`, async () => {
				const outcome = await provisionChannel(
					{
						notifications,
						...(secrets ? { secrets } : {}),
						scope: scope ?? { kind: "repo" },
						dryRun,
						print,
						tally,
					},
					{
						name: channel.name,
						category: category.name,
						...(channel.topic ? { topic: channel.topic } : {}),
						...(effectiveAccess(category.access, channel.access)
							? { access: effectiveAccess(category.access, channel.access)! }
							: {}),
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

	if (report.failures.length > 0) {
		report.status = "fail";
	} else if (dryRun) {
		report.status = "dry-run";
	}
	print("");
	print(style.header(`${tally.ok} ok, ${report.failures.length} fail, ${tally.skip} skipped`));
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
