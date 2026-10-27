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

import { input as prompt } from "@inquirer/prompts";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Monitoring,
	type NotificationsAccess,
	type NotificationsChannelLayout,
	type NotificationsLayout,
	PluginLoader,
	type Secrets,
} from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import {
	assertSecretsReachable,
	describeAvatarSource,
	layoutSecretProblem,
	loadAvatar,
	loadFirstAvatar,
	notificationProviders,
	pickProvisioner,
	provisionChannel,
	whyMissing,
} from "../notifications-channel-add/index.js";
import { roleTeamProblem } from "../notifications-sync-roles/plan.js";
import type { NotificationsSetupReport, RoleOutcome, RunNotificationsSetupInput } from "./notifications-setup.type.js";
import { withElevation } from "./with-elevation.js";

/** A channel's access: its category's, with any field the channel states itself laid over it. */
/** The picture a channel's webhook should have: its own, else the layout's, else none. */
export function webhookAvatarOf(
	layout: NotificationsLayout,
	webhook: boolean | { avatar?: string } | undefined
): string | undefined {
	return (typeof webhook === "object" ? webhook.avatar : undefined) ?? layout.webhookAvatar;
}

/**
 * The pictures a feed's webhook may wear, in order of preference: the config's own (a single source, or `{ url, image }`,
 * the URL first and the file in the repo as its fallback), else the provider's own icon (its URL, then the image it carries),
 * else the layout's, else none.
 */
export function feedAvatarOf(
	layout: NotificationsLayout,
	feed: true | { avatar?: string | { url?: string; image?: string } },
	monitoring?: Pick<Monitoring, "icon">
): string[] {
	const own = typeof feed === "object" ? feed.avatar : undefined;
	if (own === undefined) {
		const icon = [monitoring?.icon?.url, monitoring?.icon?.dataUri].filter((source): source is string =>
			Boolean(source)
		);
		if (icon.length > 0) return icon;
		return layout.webhookAvatar ? [layout.webhookAvatar] : [];
	}
	if (typeof own === "string") return [own];
	return [own.url, own.image].filter((source): source is string => Boolean(source));
}

/** The names a channel's monitoring feed uses: the alert channel (`Message to #uptime`) and its dedicated webhook (`Checkly`). */
export function monitoringFeed(
	channel: string,
	feed: true | { name?: string; webhook?: string; avatar?: string | { url?: string; image?: string } },
	monitoring: Pick<Monitoring, "providerName">
): { name: string; webhook: string } {
	const own = typeof feed === "object" ? feed : {};
	const provider = monitoring.providerName;
	return {
		name: own.name ?? `Message to #${channel}`,
		webhook: own.webhook ?? provider.charAt(0).toUpperCase() + provider.slice(1),
	};
}

/**
 * The first reason the layout's monitoring feeds cannot work, or undefined. Checked before anything is created: two feeds
 * sharing an alert channel name would redirect each other's alerts, and a feed webhook named like the channel's own
 * (Discord matches names without regard to case) would share its URL, so revoking one revokes the other.
 */
export function feedProblem(
	layout: NotificationsLayout,
	monitoring: Pick<Monitoring, "providerName" | "ensureAlertChannel">
): string | undefined {
	const alertNames = new Map<string, string>();
	for (const category of layout.categories ?? []) {
		for (const channel of category.channels ?? []) {
			if (!channel.feeds?.monitoring) continue;
			if (!monitoring.ensureAlertChannel) {
				return `channel \`${channel.name}\` is fed by monitoring, but the \`${monitoring.providerName}\` provider cannot manage alert channels`;
			}
			const picture = typeof channel.feeds.monitoring === "object" ? channel.feeds.monitoring.avatar : undefined;
			if (typeof picture === "object") {
				if (!picture.url && !picture.image) {
					return `channel \`${channel.name}\`: \`feeds.monitoring.avatar\` needs a \`url\`, an \`image\`, or both`;
				}
				if (picture.url && !/^https:\/\//i.test(picture.url)) {
					return `channel \`${channel.name}\`: \`feeds.monitoring.avatar.url\` must be an https:// URL`;
				}
				if (picture.image && /^https?:\/\//i.test(picture.image)) {
					return `channel \`${channel.name}\`: \`feeds.monitoring.avatar.image\` must be a file in the repo, not a URL`;
				}
			}
			const feed = monitoringFeed(channel.name, channel.feeds.monitoring, monitoring);
			const own = (typeof channel.webhook === "object" ? channel.webhook.name : undefined) ?? channel.name;
			if (channel.webhook && feed.webhook.toLowerCase() === own.toLowerCase()) {
				return `channel \`${channel.name}\`: the monitoring webhook and the channel's own webhook are both named ${own} — rename one`;
			}
			const other = alertNames.get(feed.name.toLowerCase());
			if (other) {
				return `channels \`${other}\` and \`${channel.name}\` would both use the alert channel ${feed.name} — give one a distinct \`feeds.monitoring.name\``;
			}
			alertNames.set(feed.name.toLowerCase(), channel.name);
		}
	}
	return undefined;
}

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
	// A role that may post must be able to see the channel, or the post permission does nothing.
	const cannotSee = (where: string, access: NotificationsAccess | undefined): string | undefined => {
		if (!Array.isArray(access?.view) || !Array.isArray(access?.post)) return undefined;
		const seen = new Set(access.view.map((r) => r.toLowerCase()));
		const stuck = access.post.find((r) => !seen.has(r.toLowerCase()));
		return stuck === undefined
			? undefined
			: `${where}: the role \`${stuck}\` may post but is not in \`view\`, so it could not see the channel`;
	};
	for (const category of layout.categories ?? []) {
		const problem = check(`category \`${category.name}\``, category.access);
		if (problem) return problem;
		const stuckCategory = cannotSee(`category \`${category.name}\``, category.access);
		if (stuckCategory) return stuckCategory;
		for (const channel of category.channels ?? []) {
			const found = check(`channel \`${channel.name}\``, channel.access);
			if (found) return found;
			const stuck = cannotSee(`channel \`${channel.name}\``, effectiveAccess(category.access, channel.access));
			if (stuck) return stuck;
		}
	}
	return undefined;
}

/**
 * The first problem with the layout's `server`, `welcome` and `onboarding` sections that needs no knowledge of
 * the provider, or undefined: every channel or role they name must be in the layout, and a channel name must
 * not be used twice (it could mean either, so they would pick one at random).
 */
export function serverLayoutProblem(layout: NotificationsLayout): string | undefined {
	const counts = new Map<string, number>();
	for (const name of (layout.categories ?? []).flatMap((c) =>
		(c.channels ?? []).map((ch) => ch.name.toLowerCase())
	)) {
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	const declared = (layout.categories ?? []).flatMap((c) => c.channels ?? []);
	const roles = new Set((layout.roles ?? []).map((r) => r.name.toLowerCase()));
	const channel = (where: string, name: string): string | undefined => {
		const count = counts.get(name.toLowerCase()) ?? 0;
		if (count === 0) return `${where} names the channel \`${name}\`, which is not in the layout's channels`;
		if (count > 1) return `${where} names \`${name}\`, but more than one channel in the layout has that name`;
		return undefined;
	};

	if (layout.testChannel !== undefined) {
		const problem = channel("`testChannel`", layout.testChannel);
		if (problem) return problem;
		const hasWebhook = declared.some(
			(ch) => ch.name.toLowerCase() === layout.testChannel!.toLowerCase() && ch.webhook
		);
		if (!hasWebhook) return `\`testChannel\` names \`${layout.testChannel}\`, which declares no webhook`;
	}

	const roleTeams = roleTeamProblem(layout);
	if (roleTeams) return roleTeams;
	const emptyTeam = (layout.roles ?? []).find((r) => r.team !== undefined && r.team.trim() === "");
	if (emptyTeam) return `role \`${emptyTeam.name}\` has an empty \`team\``;

	const everyone = layout.everyone;
	const both = (everyone?.allow ?? []).find((p) =>
		(everyone?.deny ?? []).some((d) => d.toLowerCase() === p.toLowerCase())
	);
	if (both !== undefined) return `everyone: \`${both}\` is in both \`allow\` and \`deny\``;

	const server = layout.server;
	if (server) {
		for (const field of ["systemChannel", "rulesChannel", "updatesChannel"] as const) {
			const name = server[field];
			const problem = name === undefined ? undefined : channel(`server: \`${field}\``, name);
			if (problem) return problem;
		}
		if (server.community === true && (!server.rulesChannel || !server.updatesChannel)) {
			return "server: `community: true` needs both `rulesChannel` and `updatesChannel`";
		}
	}
	for (const entry of layout.welcome?.channels ?? []) {
		const problem = channel("welcome:", entry.channel);
		if (problem) return problem;
	}
	for (const pin of layout.pinned ?? []) {
		const problem = channel("pinned:", pin.channel);
		if (problem) return problem;
		if (pin.content.trim() === "") return `pinned: the message for \`${pin.channel}\` is empty`;
	}
	const onboarding = layout.onboarding;
	for (const name of onboarding?.defaultChannels ?? []) {
		const problem = channel("onboarding: `defaultChannels`", name);
		if (problem) return problem;
	}
	for (const prompt of onboarding?.prompts ?? []) {
		for (const option of prompt.options) {
			for (const name of option.channels ?? []) {
				const problem = channel(`onboarding: the option \`${option.title}\``, name);
				if (problem) return problem;
			}
			for (const role of option.roles ?? []) {
				if (!roles.has(role.toLowerCase())) {
					return `onboarding: the option \`${option.title}\` gives the role \`${role}\`, which is not in the layout's roles`;
				}
			}
		}
	}
	return undefined;
}

export async function runNotificationsSetup(input: RunNotificationsSetupInput): Promise<NotificationsSetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	if (!input.preloaded) await loader.load();
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
	// Channels fed by the monitoring provider hand it a dedicated webhook as an alert channel.
	let monitoring: Monitoring | undefined;
	if ((layout.categories ?? []).some((c) => (c.channels ?? []).some((ch) => ch.feeds?.monitoring))) {
		if (!loader.has("monitoring")) {
			return refuse(
				whyMissing(
					loader,
					"monitoring",
					"a channel is fed by monitoring, which needs a `monitoring` capability — add a `monitoring` provider"
				)
			);
		}
		monitoring = loader.get("monitoring") as Monitoring;
		const problem = feedProblem(layout, monitoring);
		if (problem) return refuse(problem);
	}

	// The pictures a channel's feed may wear, in order (none when it has no feed).
	const feedAvatarsOf = (channel: NotificationsChannelLayout): string[] =>
		channel.feeds?.monitoring ? feedAvatarOf(layout, channel.feeds.monitoring, monitoring) : [];
	// Read every avatar first: one that cannot be read should stop the run before anything, even the secrets probe, is written.
	const avatars = new Map<string, string>();
	// A relative path is the repository's, wherever the command is run from.
	const read = input.loadAvatar ?? ((source: string) => loadAvatar(source, input.context.repoRoot));
	for (const channel of (layout.categories ?? []).flatMap((c) => c.channels ?? [])) {
		const own = channel.webhook ? webhookAvatarOf(layout, channel.webhook) : undefined;
		if (own !== undefined && !avatars.has(own)) {
			try {
				avatars.set(own, await read(own));
			} catch (err) {
				return refuse(`webhook avatar \`${describeAvatarSource(own)}\`: ${errorMessage(err)}`);
			}
		}
		// A feed's picture may list fallbacks (a URL, then a file in the repo): the first that can be read is used.
		const feedSources = feedAvatarsOf(channel);
		const feedKey = JSON.stringify(feedSources);
		if (feedSources.length > 0 && !avatars.has(feedKey)) {
			try {
				avatars.set(
					feedKey,
					await loadFirstAvatar(feedSources, read, (source, reason, moreToTry) =>
						print(
							`  ${style.skip(`avatar ${describeAvatarSource(source)} could not be read (${reason})${moreToTry ? "; trying the next" : ""}`)}`
						)
					)
				);
			} catch (err) {
				return refuse(`webhook avatar ${errorMessage(err)}`);
			}
		}
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
	const serverProblem = serverLayoutProblem(layout);
	if (serverProblem) return refuse(serverProblem);
	if (layout.server && !notifications.ensureServer) {
		return refuse(
			`the layout declares \`server\` settings, but the \`${notifications.providerName}\` provider cannot manage them`
		);
	}
	if (layout.welcome && !notifications.ensureWelcome) {
		return refuse(
			`the layout declares a \`welcome\` screen, but the \`${notifications.providerName}\` provider cannot manage one`
		);
	}
	if (layout.onboarding && !notifications.ensureOnboarding) {
		return refuse(
			`the layout declares \`onboarding\`, but the \`${notifications.providerName}\` provider cannot manage it`
		);
	}
	if ((layout.pinned?.length ?? 0) > 0 && !notifications.ensurePinned) {
		return refuse(
			`the layout declares \`pinned\` messages, but the \`${notifications.providerName}\` provider cannot manage them`
		);
	}
	if (layout.application && !notifications.ensureApplication) {
		return refuse(
			`the layout declares \`application\` settings, but the \`${notifications.providerName}\` provider cannot manage them`
		);
	}
	if (layout.everyone && !notifications.ensureEveryone) {
		return refuse(
			`the layout declares \`everyone\` permissions, but the \`${notifications.providerName}\` provider cannot manage them`
		);
	}
	// A category's access cannot be applied by a provider that has no categories: do not report success without it.
	const needsCategories = (layout.categories ?? []).find((c) => c.access);
	if (needsCategories && !notifications.ensureCategory) {
		return refuse(
			`category \`${needsCategories.name}\` declares \`access\`, but the \`${notifications.providerName}\` provider cannot manage categories`
		);
	}
	const providerProblem = notifications.validateLayout?.(layout);
	if (providerProblem) return refuse(providerProblem);
	// Then prove the credentials reach the parts of the layout that need more than the rest, so a bot
	// that lacks a permission fails here, with nothing created, and not after the roles and channels.
	if (!dryRun && notifications.preflight) {
		try {
			await notifications.preflight(layout);
		} catch (err) {
			return refuse(describeProviderError(err), logReason(err));
		}
	}

	// Tallied for the closing summary: made or stored (ok), already there or only previewed (skip), failed (fail).
	const tally = { ok: 0, skip: 0 };
	const made = (created: boolean) => void (created ? tally.ok++ : tally.skip++);

	const attempt = async (step: string, fn: () => Promise<void>): Promise<boolean> => {
		try {
			await fn();
			return true;
		} catch (err) {
			const message = describeProviderError(err);
			print(`  ${style.fail(`${step}: ${message}`)}`);
			report.failures.push({ step, message });
			return false;
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
		const categoryOk = await attempt(`category ${category.name}`, async () => {
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
		const channels = category.channels ?? [];
		if (!categoryOk && channels.length > 0) {
			// Creating its channels now would recreate the category without its access, and expose it.
			print(
				`  ${style.skip(`skipped ${channels.length} channel${channels.length === 1 ? "" : "s"}: the category failed`)}`
			);
			tally.skip += channels.length;
			continue;
		}
		for (const channel of channels) {
			await attempt(`channel ${channel.name}`, async () => {
				const source = channel.webhook ? webhookAvatarOf(layout, channel.webhook) : undefined;
				const webhook = channel.webhook
					? {
							...(channel.webhook === true ? {} : channel.webhook),
							...(source ? { avatar: avatars.get(source)! } : {}),
						}
					: undefined;
				const outcome = await provisionChannel(
					{
						notifications,
						...(secrets ? { secrets } : {}),
						...(monitoring ? { monitoring } : {}),
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
						...(webhook ? { webhook } : {}),
						...(channel.feeds?.monitoring
							? {
									feeds: {
										monitoring: {
											...monitoringFeed(channel.name, channel.feeds.monitoring, monitoring!),
											...(feedAvatarsOf(channel).length > 0
												? { avatar: avatars.get(JSON.stringify(feedAvatarsOf(channel)))! }
												: {}),
										},
									},
								}
							: {}),
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

	// The server's own settings come last: they name channels and roles, which exist by now.
	if (
		layout.server ||
		layout.welcome ||
		layout.onboarding ||
		(layout.pinned?.length ?? 0) > 0 ||
		layout.application ||
		layout.everyone
	) {
		print(`\n${style.header("Server")}`);
		const apply = async (
			label: string,
			declared: boolean,
			run: () => Promise<{ updated: string[]; todo?: string[] }>
		): Promise<void> => {
			if (!declared) return;
			await attempt(label, async () => {
				if (dryRun) {
					print(`  ${style.skip(`would ensure ${label}`)}`);
					tally.skip++;
					return;
				}
				const result = await run();
				const changed = result.updated.length > 0;
				print(
					`  ${(changed ? style.success : style.skip)(`${changed ? "updated" : "exists "} ${label}${changed ? `: ${result.updated.join(", ")}` : ""}`)}`
				);
				made(changed);
				// What only a person can do: shown, and counted as a failure so the run does not look finished.
				for (const todo of result.todo ?? []) {
					print(`  ${style.fail(`${label}: ${todo}`)}`);
					report.failures.push({ step: label, message: todo });
				}
			});
		};
		await apply("@everyone permissions", !!layout.everyone, () => notifications.ensureEveryone!(layout.everyone!));
		// A person at a terminal can be walked through the one-off Administrator step; a script gets the explanation.
		/* v8 ignore next 4 -- the real prompt only runs with a terminal attached; tests pass their own */
		const pause =
			input.pause === false
				? undefined
				: (input.pause ??
					(process.stdin.isTTY && process.stdout.isTTY
						? async (message: string) => void (await prompt({ message }))
						: undefined));
		await apply("server settings", !!layout.server, () =>
			withElevation(() => notifications.ensureServer!(layout.server!), {
				label: "server settings",
				notifications,
				...(pause ? { pause } : {}),
				print,
			})
		);
		await apply("welcome screen", !!layout.welcome, () => notifications.ensureWelcome!(layout.welcome!));
		// Pinning needs Pin Messages, which the bot may not hold yet: a person at a terminal is walked through it.
		await apply("pinned messages", (layout.pinned?.length ?? 0) > 0, () =>
			withElevation(() => notifications.ensurePinned!(layout.pinned!), {
				label: "pinned messages",
				notifications,
				...(pause ? { pause } : {}),
				print,
			})
		);
		await apply("onboarding", !!layout.onboarding, () => notifications.ensureOnboarding!(layout.onboarding!));
		await apply("bot application", !!layout.application, () =>
			notifications.ensureApplication!(layout.application!)
		);
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
