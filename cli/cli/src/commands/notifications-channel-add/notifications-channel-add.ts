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
	type NotificationsLayout,
	PluginLoader,
	type Secrets,
	type SecretScope,
} from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
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
export function whyMissing(
	loader: PluginLoader,
	key: "secrets" | "notifications" | "source" | "monitoring" | "errors" | "workers" | "dns",
	fallback: string
): string {
	const failure = loader.loadFailures().find((f) => f.key === key);
	return failure
		? `${fallback} (\`${failure.provider}\` failed to load: ${describeProviderError(failure.error)})`
		: fallback;
}

/** The configured `notifications` providers, or an error that says why there are none (including a plugin that failed to load). */
export function notificationProviders(loader: PluginLoader): Notifications[] {
	const providers = loader.has("notifications") ? loader.get("notifications") : [];
	if (providers.length === 0) {
		throw new Error(
			whyMissing(
				loader,
				"notifications",
				"no `notifications` provider is available — add one to holocron.config.ts"
			)
		);
	}
	return providers;
}

/**
 * Pick the provider that can do what the command needs; with several, `--provider`
 * decides. `can` says what "able" means (a command that only reads needs `inspect`, not
 * provisioning), and `verb` words the errors.
 */
export function pickProvider(
	providers: Notifications[],
	wanted: string | undefined,
	can: (p: Notifications) => boolean,
	verb: { infinitive: string; gerund: string }
): Notifications {
	const capable = providers.filter(can);
	if (capable.length === 0) {
		throw new Error(
			`no \`notifications\` provider can ${verb.infinitive} — add one that implements it (for example discord) to holocron.config.ts`
		);
	}
	if (wanted) {
		const match = capable.find((p) => p.providerName === wanted);
		if (!match) {
			throw new Error(
				`no ${verb.gerund} \`notifications\` provider named \`${wanted}\` (have: ${names(capable)})`
			);
		}
		return match;
	}
	if (capable.length > 1) {
		throw new Error(
			`several \`notifications\` providers can ${verb.infinitive} (${names(capable)}) — pass --provider <name>`
		);
	}
	return capable[0]!;
}

/** Pick the provider that can provision. Any ensure* method counts: a role-only layout needs no channel support. */
export function pickProvisioner(providers: Notifications[], wanted?: string): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) =>
			typeof p.ensureChannel === "function" ||
			typeof p.ensureCategory === "function" ||
			typeof p.ensureRole === "function",
		{ infinitive: "provision", gerund: "provisioning" }
	);
}

const names = (ps: Notifications[]) => ps.map((p) => p.providerName).join(", ");

/**
 * The first reason the layout's secret names cannot work, or undefined. Two things
 * cannot share one secret: the second write would overwrite the first and callers
 * would read the wrong value. Punctuation normalising (release-notes vs
 * release_notes) makes that easy to hit by accident, GitHub secret names are
 * case-insensitive, and the preflight's own prefix is reserved. Shared by `setup`
 * (which refuses) and `verify` (which reports it).
 */
export function layoutSecretProblem(layout: NotificationsLayout): string | undefined {
	const taken = new Map<string, string>();
	const claim = (secret: string, owner: string, hint: string): string | undefined => {
		if (isReservedSecret(secret)) {
			return `${owner} would store into ${secret}, a name reserved for the setup preflight — choose another`;
		}
		const key = secret.toUpperCase();
		const other = taken.get(key);
		if (other) return `${other} and ${owner} would both store into ${secret} — ${hint}`;
		taken.set(key, owner);
		return undefined;
	};
	for (const category of layout.categories ?? []) {
		for (const channel of category.channels ?? []) {
			if (!channel.webhook) continue;
			const secret = (channel.webhook !== true && channel.webhook.secret) || defaultSecretName(channel.name);
			const clash = claim(secret, `channel \`${channel.name}\``, "give one a distinct `webhook.secret`");
			if (clash) return clash;
		}
	}
	for (const role of layout.roles ?? []) {
		if (!role.secret) continue;
		const clash = claim(role.secret, `role \`${role.name}\``, "give one a distinct secret");
		if (clash) return clash;
	}
	return undefined;
}

/** Ensure one channel and, if asked, its webhook + secret. Shared with `notifications setup`. */
export async function provisionChannel(deps: ProvisionDeps, spec: ChannelSpec): Promise<ChannelOutcome> {
	const { notifications, secrets, scope, dryRun, print, tally } = deps;
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
	const feed = spec.feeds?.monitoring;
	if (feed) {
		if (!deps.monitoring?.ensureAlertChannel) {
			throw new Error(
				`channel ${spec.name} is fed by monitoring, which needs a \`monitoring\` provider that manages alert channels — add one to holocron.config.ts`
			);
		}
		if (!notifications.ensureWebhook) throw new Error(`\`${notifications.providerName}\` cannot create webhooks`);
		if (webhookCfg && feed.webhook.toLowerCase() === webhookName.toLowerCase()) {
			throw new Error(
				`channel ${spec.name}: the monitoring webhook and the channel's own webhook are both named ${webhookName} — rename one`
			);
		}
	}

	const relay = spec.feeds?.errors;
	if (relay && !notifications.ensureWebhook) {
		throw new Error(`\`${notifications.providerName}\` cannot create webhooks`);
	}

	if (dryRun) {
		print(`  ${style.skip(`would ensure channel ${spec.name}${where}`)}`);
		if (tally) tally.skip += webhookCfg ? 2 : 1;
		if (webhookCfg)
			print(`  ${style.skip(`would ensure webhook ${webhookName} and store its URL in ${secretName}`)}`);
		if (feed) {
			print(
				`  ${style.skip(`would ensure webhook ${feed.webhook} and alert channel ${feed.name} (monitoring)`)}`
			);
			if (tally) tally.skip += 2;
		}
		if (relay) {
			print(`  ${style.skip(`would ensure webhook ${relay.webhook} for the relay Worker (errors)`)}`);
			if (tally) tally.skip++;
		}
		return { name: spec.name, ...(spec.category ? { category: spec.category } : {}), created: false };
	}

	const channel = await notifications.ensureChannel({
		name: spec.name,
		...(spec.category ? { category: spec.category } : {}),
		...(spec.topic ? { topic: spec.topic } : {}),
		...(spec.access ? { access: spec.access } : {}),
	});
	const changed = channel.created || (channel.updated?.length ?? 0) > 0;
	const verb = channel.created ? "created" : changed ? "updated" : "exists ";
	const what = channel.updated?.length ? `: ${channel.updated.join(", ")}` : "";
	print(`  ${(changed ? style.success : style.skip)(`${verb} channel ${spec.name}${where}${what}`)}`);
	if (tally) tally[changed ? "ok" : "skip"]++;
	const outcome: ChannelOutcome = {
		name: spec.name,
		...(spec.category ? { category: spec.category } : {}),
		created: channel.created,
		...(channel.updated?.length ? { updated: channel.updated } : {}),
	};
	if (!webhookCfg) {
		if (feed) await provisionFeed(deps, spec, feed, outcome);
		if (relay) await provisionRelayFeed(deps, spec, relay, outcome);
		return outcome;
	}

	const hook = await notifications.ensureWebhook!({
		channel: spec.name,
		name: webhookName,
		...(spec.category ? { category: spec.category } : {}),
		...(webhookCfg.avatar ? { avatar: webhookCfg.avatar } : {}),
	});
	const avatarSet = hook.updated?.includes("avatar") ?? false;
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
		print(
			`  ${style.success(`${hook.created ? "created" : "found  "} webhook ${webhookName}; URL stored in ${secretName}`)}`
		);
		if (tally) tally.ok++;
		outcome.webhook = {
			name: webhookName,
			created: hook.created,
			secret: secretName,
			stored: true,
			...(avatarSet ? { updated: ["avatar"] } : {}),
		};
	} else {
		const note =
			`webhook ${webhookName} already exists and its URL cannot be read back — ` +
			`delete it in the provider and re-run, or set ${secretName} yourself`;
		print(`  ${style.warn(note)}`);
		outcome.webhook = {
			name: webhookName,
			created: hook.created,
			secret: secretName,
			stored: false,
			note,
			...(avatarSet ? { updated: ["avatar"] } : {}),
		};
	}
	if (avatarSet) {
		print(`  ${style.success(`set     avatar on webhook ${webhookName}`)}`);
		if (tally) tally.ok++;
	}
	// After the URL is stored: the webhook is good, so its URL must not be lost to this.
	if (hook.avatarError) {
		throw new Error(`webhook ${webhookName} is ready but setting its avatar failed (${hook.avatarError})`);
	}
	if (feed) await provisionFeed(deps, spec, feed, outcome);
	if (relay) await provisionRelayFeed(deps, spec, relay, outcome);
	return outcome;
}

/**
 * A dedicated webhook for the relay Worker. Its URL goes to the caller (which hands it to the Worker as a secret) and
 * nowhere else. The bot's own webhook hands its URL out on every read, so a re-run gets it again; one made by a
 * person does not, and is reported rather than guessed at.
 */
async function provisionRelayFeed(
	deps: ProvisionDeps,
	spec: ChannelSpec,
	feed: { webhook: string; avatar?: string },
	outcome: ChannelOutcome
): Promise<void> {
	const { notifications, print, tally } = deps;
	const hook = await notifications.ensureWebhook!({
		channel: spec.name,
		name: feed.webhook,
		...(spec.category ? { category: spec.category } : {}),
		...(feed.avatar ? { avatar: feed.avatar } : {}),
	});
	const avatarSet = hook.updated?.includes("avatar") ?? false;
	const changed = hook.created || avatarSet;
	print(
		`  ${(changed ? style.success : style.skip)(`${hook.created ? "created" : "found  "} webhook ${feed.webhook} for the relay${avatarSet ? " (avatar set)" : ""}`)}`
	);
	if (tally) {
		const done = Number(hook.created) + Number(avatarSet);
		if (done > 0) tally.ok += done;
		else tally.skip++;
	}
	outcome.relayWebhook = { name: feed.webhook, created: hook.created, ...(avatarSet ? { updated: ["avatar"] } : {}) };
	if (!hook.url) {
		throw new Error(
			`webhook ${feed.webhook} already exists and its URL cannot be read back, so the relay cannot post through it — delete it in the provider and re-run`
		);
	}
	deps.onRelayWebhook?.(hook.url);
	if (hook.avatarError) {
		throw new Error(`webhook ${feed.webhook} is ready but setting its avatar failed (${hook.avatarError})`);
	}
}

/**
 * A dedicated webhook for the monitoring provider, handed to it as an alert channel. Its URL goes to the provider and
 * nowhere else: it is shown once and no secret holds it. When the webhook already exists the URL cannot be read back, so
 * an existing alert channel keeps the one it has and only its subscriptions are brought in line.
 */
async function provisionFeed(
	deps: ProvisionDeps,
	spec: ChannelSpec,
	feed: { name: string; webhook: string; avatar?: string },
	outcome: ChannelOutcome
): Promise<void> {
	const { notifications, monitoring, print, tally } = deps;
	const hook = await notifications.ensureWebhook!({
		channel: spec.name,
		name: feed.webhook,
		...(spec.category ? { category: spec.category } : {}),
		...(feed.avatar ? { avatar: feed.avatar } : {}),
	});
	const avatarSet = hook.updated?.includes("avatar") ?? false;
	const hookChanged = hook.created || avatarSet;
	print(
		`  ${(hookChanged ? style.success : style.skip)(`${hook.created ? "created" : "found  "} webhook ${feed.webhook}${avatarSet ? " (avatar set)" : ""}`)}`
	);
	// Counted like a channel's own webhook: making it and setting its picture are one success each.
	if (tally) {
		const done = Number(hook.created) + Number(avatarSet);
		if (done > 0) tally.ok += done;
		else tally.skip++;
	}
	let result;
	try {
		result = await monitoring!.ensureAlertChannel!({
			name: feed.name,
			format: "discord",
			...(hook.url ? { url: hook.url } : {}),
		});
	} catch (err) {
		// Nothing is lost: the webhook exists and, being the bot's own, hands its URL out again, so a re-run retries.
		if (!hook.url) throw err;
		throw new Error(
			`webhook ${feed.webhook} was created but handing its URL to ${monitoring!.providerName} failed ` +
				`(${describeProviderError(err)}) — the webhook is kept, so re-run once that is fixed`,
			{ cause: err }
		);
	}
	const changed = result.created || result.updated.length > 0;
	const verb = result.created ? "created" : changed ? "updated" : "exists ";
	const what = result.updated.length > 0 ? `: ${result.updated.join(", ")}` : "";
	print(
		`  ${(changed ? style.success : style.skip)(`${verb} alert channel ${feed.name} via webhook ${feed.webhook}${what} (${result.subscribed} checks)`)}`
	);
	if (tally) tally[changed ? "ok" : "skip"]++;
	outcome.alertChannel = {
		name: feed.name,
		created: result.created,
		updated: result.updated,
		subscribed: result.subscribed,
	};
	// After the URL is handed over: the webhook is good, so its URL must not be lost to this.
	if (hook.avatarError) {
		throw new Error(`webhook ${feed.webhook} is ready but setting its avatar failed (${hook.avatarError})`);
	}
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
		const notifications = pickProvisioner(notificationProviders(loader), input.provider);

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
			print(`  ${style.fail(message)}`);
			return { status: "fail", channel, message };
		}
		return { status: dryRun ? "dry-run" : "ok", channel };
	} catch (err) {
		const message = describeProviderError(err);
		print(`  ${style.fail(message)}`);
		logger.warn({ channel: input.name, reason: logReason(err) }, `notifications channel add: ${input.name}`);
		return { status: "fail", message };
	}
}
