/**
 * `holocron notifications channel add` — create one channel (and, with
 * `--with-webhook`, an inbound webhook whose URL goes straight into a secret).
 *
 * Provider-neutral: it drives the `notifications` capability's `ensure*`
 * methods, so any provider that implements them works. Idempotent — an
 * existing channel or webhook is left alone, and a webhook URL is never
 * printed, only stored.
 */

import { randomBytes } from "node:crypto";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Notifications,
	PluginLoader,
	type Secrets,
	type SecretScope,
} from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import type {
	ChannelOutcome,
	ChannelSpec,
	NotificationsChannelAddReport,
	ProvisionDeps,
	RunNotificationsChannelAddInput,
} from "./notifications-channel-add.type.js";

/**
 * `HOLOCRON_NOTIFY_WEBHOOK_SYNC` for channel `sync`. Named after the job, not the
 * provider, so changing providers means re-pointing the same secrets at new
 * webhook URLs, with no workflow edits.
 */
export function defaultSecretName(channel: string): string {
	return `HOLOCRON_NOTIFY_WEBHOOK_${channel.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/**
 * Prefix of the throwaway secret the preflight writes and removes. Every run adds a
 * random suffix, so it can never overwrite (and then delete) a secret someone already
 * has; layouts may not use any name under this prefix for their own secrets.
 */
export const PREFLIGHT_PREFIX = "HOLOCRON_NOTIFY_PREFLIGHT";

/** Whether a secret name is under the preflight's reserved prefix. GitHub secret names are case-insensitive. */
export function isReservedSecret(name: string): boolean {
	return name.toUpperCase().startsWith(PREFLIGHT_PREFIX);
}

/**
 * Prove the secrets store can be WRITTEN before creating anything that needs it.
 * A webhook's URL is shown once; creating the webhook and then failing to store
 * it leaves an orphan the user has to delete by hand. Listing is not enough --
 * a token can read secrets it cannot write -- so write a throwaway secret and
 * remove it.
 */
export async function assertSecretsReachable(secrets: Secrets, scope: SecretScope): Promise<void> {
	const probe = `${PREFLIGHT_PREFIX}_${randomBytes(4).toString("hex").toUpperCase()}`;
	try {
		await secrets.setSecret(scope, probe, "ok");
		await secrets.deleteSecret(scope, probe);
	} catch (err) {
		const where = scope.kind === "organization" ? `organization ${scope.name}` : scope.kind;
		throw new Error(
			`cannot write to the secrets store for ${where} (${describeProviderError(err)}) — fix that token before creating webhooks. If a secret named ${probe} was left behind, delete it`,
			{ cause: err }
		);
	}
}

/** Why a capability is not loaded: the plugin's own load error when there is one (e.g. a missing token). */
export function whyMissing(loader: PluginLoader, key: "secrets", fallback: string): string {
	const failure = loader.loadFailures().find((f) => f.key === key);
	return failure ? `${fallback} (\`${failure.provider}\` failed to load: ${failure.error.message})` : fallback;
}

/** Pick the provider that can provision; with several, `--provider` decides. */
export function pickProvisioner(providers: Notifications[], wanted?: string): Notifications {
	// Any ensure* method counts: a role-only layout needs no channel support.
	const capable = providers.filter(
		(p) =>
			typeof p.ensureChannel === "function" ||
			typeof p.ensureCategory === "function" ||
			typeof p.ensureRole === "function"
	);
	if (capable.length === 0) {
		throw new Error(
			"no `notifications` provider can provision — add one that implements it (for example discord) to holocron.config.ts"
		);
	}
	if (wanted) {
		const match = capable.find((p) => p.providerName === wanted);
		if (!match) {
			throw new Error(`no provisioning \`notifications\` provider named \`${wanted}\` (have: ${names(capable)})`);
		}
		return match;
	}
	if (capable.length > 1) {
		throw new Error(
			`several \`notifications\` providers can provision (${names(capable)}) — pass --provider <name>`
		);
	}
	return capable[0]!;
}

const names = (ps: Notifications[]) => ps.map((p) => p.providerName).join(", ");

/** Ensure one channel and, if asked, its webhook + secret. Shared with `notifications setup`. */
export async function provisionChannel(deps: ProvisionDeps, spec: ChannelSpec): Promise<ChannelOutcome> {
	const { notifications, secrets, scope, dryRun, print } = deps;
	const webhookCfg = spec.webhook || undefined;
	const secretName = webhookCfg?.secret ?? defaultSecretName(spec.name);
	const webhookName = webhookCfg?.name ?? spec.name;
	const where = spec.category ? ` in ${spec.category}` : "";

	// Check everything the request needs BEFORE the dry-run return and before any
	// change, so a preview never promises what a real run cannot do and a real run
	// never leaves a channel behind before failing.
	if (!notifications.ensureChannel) {
		throw new Error(`\`${notifications.providerName}\` cannot create channels`);
	}
	if (webhookCfg && !notifications.ensureWebhook) {
		throw new Error(`\`${notifications.providerName}\` cannot create webhooks`);
	}
	if (webhookCfg && isReservedSecret(secretName)) {
		throw new Error(`secret name ${secretName} is reserved for the setup preflight -- choose another`);
	}
	if (webhookCfg && !dryRun && !secrets) {
		throw new Error("storing a webhook URL needs a `secrets` provider — add one to holocron.config.ts");
	}

	if (dryRun) {
		print(`  … would ensure channel ${spec.name}${where}`);
		if (webhookCfg) print(`  … would ensure webhook ${webhookName} and store its URL in ${secretName}`);
		return { name: spec.name, ...(spec.category ? { category: spec.category } : {}), created: false };
	}

	const channel = await notifications.ensureChannel({
		name: spec.name,
		...(spec.category ? { category: spec.category } : {}),
		...(spec.topic ? { topic: spec.topic } : {}),
	});
	print(`  ${channel.created ? "✓ created" : "· exists "} channel ${spec.name}${where}`);
	const outcome: ChannelOutcome = {
		name: spec.name,
		...(spec.category ? { category: spec.category } : {}),
		created: channel.created,
	};
	if (!webhookCfg) return outcome;

	const hook = await notifications.ensureWebhook!({
		channel: spec.name,
		name: webhookName,
		...(spec.category ? { category: spec.category } : {}),
	});
	if (hook.url) {
		// The URL is a credential: it goes to the secret store and nowhere else.
		try {
			await secrets!.setSecret(scope, secretName, hook.url);
		} catch (err) {
			// The URL is shown once and is now lost; say how to get unstuck.
			throw new Error(
				`webhook ${webhookName} was ${hook.created ? "created" : "found"} but storing its URL in ${secretName} failed ` +
					`(${describeProviderError(err)}) — delete the webhook in the provider and re-run to get a fresh URL`,
				{ cause: err }
			);
		}
		print(`  ✓ ${hook.created ? "created" : "found  "} webhook ${webhookName}; URL stored in ${secretName}`);
		outcome.webhook = { name: webhookName, created: hook.created, secret: secretName, stored: true };
	} else {
		const note =
			`webhook ${webhookName} already exists and its URL cannot be read back — ` +
			`delete it in the provider and re-run, or set ${secretName} yourself`;
		print(`  ! ${note}`);
		outcome.webhook = { name: webhookName, created: hook.created, secret: secretName, stored: false, note };
	}
	return outcome;
}

export async function runNotificationsChannelAdd(
	input: RunNotificationsChannelAddInput
): Promise<NotificationsChannelAddReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications channel add");

	const dryRun = input.context.dryRun ?? false;
	print(`Holocron notifications channel add — ${input.name}${dryRun ? " (dry-run)" : ""}`);

	// Every failure below is printed and returned, never thrown: the CLI's global
	// handler swallows a plain Error, so a bare throw would exit 1 with no message.
	try {
		const notifications = pickProvisioner(
			loader.has("notifications") ? loader.get("notifications") : [],
			input.provider
		);

		// A dry-run stores nothing, so it needs no credentials for the secrets provider.
		let secrets: Secrets | undefined;
		if (input.withWebhook && !dryRun) {
			if (!loader.has("secrets")) {
				throw new Error(
					whyMissing(
						loader,
						"secrets",
						"`--with-webhook` needs a `secrets` capability — add a `secrets` provider to holocron.config.ts"
					)
				);
			}
			secrets = loader.get("secrets") as Secrets;
		}
		const org = input.context.org;
		const scope = input.scope ?? (org ? ({ kind: "organization", name: org } as const) : undefined);
		if (input.withWebhook && !scope && !dryRun) {
			throw new Error(
				"no org to store the webhook secret under — pass --scope or set `org` in holocron.config.ts"
			);
		}

		if (secrets && scope && !dryRun) await assertSecretsReachable(secrets, scope);

		const channel = await provisionChannel(
			{ notifications, ...(secrets ? { secrets } : {}), scope: scope ?? { kind: "repo" }, dryRun, print },
			{
				name: input.name,
				...(input.category ? { category: input.category } : {}),
				...(input.topic ? { topic: input.topic } : {}),
				...(input.withWebhook
					? {
							webhook: {
								...(input.webhookName ? { name: input.webhookName } : {}),
								...(input.secret ? { secret: input.secret } : {}),
							},
						}
					: {}),
			}
		);
		logger.info(
			{ channel: input.name, created: channel.created, provider: notifications.providerName, status: "ok" },
			`notifications channel add: ${input.name}`
		);
		if (channel.webhook && !channel.webhook.stored && !dryRun) {
			// `note` is always set when a webhook was requested but not stored.
			const message = channel.webhook.note!;
			print(`  ✗ ${message}`);
			return { status: "fail", channel, message };
		}
		return { status: dryRun ? "dry-run" : "ok", channel };
	} catch (err) {
		const message = describeProviderError(err);
		print(`  ✗ ${message}`);
		logger.warn({ channel: input.name, reason: logReason(err) }, `notifications channel add: ${input.name}`);
		return { status: "fail", message };
	}
}
