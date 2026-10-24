/**
 * `holocron doctor notifications` -- read-only: compare the layout a provider
 * declares in `holocron.config.ts` with what is actually on the server and in the
 * secrets store, step by step.
 *
 * It is the end-to-end check for `notifications setup`, and stays useful after
 * as a drift check. Everything the layout and `setup` cannot do yet is listed
 * too, as plain failing steps, so the command is red until the last feature
 * lands and each feature built turns exactly one step green. The list
 * is {@link PLANNED_CHECKS}; the numbers match the table in holocron#1098.
 */

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Notifications,
	type NotificationsAccess,
	type NotificationsOnboardingLayout,
	type NotificationsWelcomeLayout,
	PluginLoader,
	type Secrets,
} from "../../plugin/index.js";
import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
import { statusRow } from "../../ui/status-row/index.js";
import { style } from "../../ui/style/index.js";
import {
	defaultSecretName,
	layoutSecretProblem,
	notificationProviders,
	pickProvider,
	whyMissing,
} from "../notifications-channel-add/index.js";
import type {
	DoctorNotificationsReport,
	NotificationsCheck,
	RunDoctorNotificationsInput,
} from "./doctor-notifications.type.js";

/** Features not built yet, in the order of the table in holocron#1098. Move an entry into a real check when it lands. */
export const PLANNED_CHECKS: ReadonlyArray<{ step: number; id: string; title: string }> = [
	{ step: 14, id: "role-assignment", title: "role assigned to team members" },
	{ step: 15, id: "post-works", title: "test post reached every channel (platform.notifyCheck)" },
	{ step: 16, id: "server-creation", title: "server created from config" },
];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type AccessValue = "everyone" | string[];
/** `everyone`, or the roles sorted and lower-cased, so order and case do not matter when comparing. */
const accessKey = (v: AccessValue): string =>
	v === "everyone" ? "everyone" : JSON.stringify([...new Set(v.map((r) => r.toLowerCase()))].sort());
/** The prompts of an onboarding in a form two of them can be compared in: the order of the channels and roles an answer gives, and case, do not matter. */
const promptKey = (p: NonNullable<NotificationsOnboardingLayout["prompts"]>[number]) =>
	JSON.stringify([
		p.singleSelect ?? false,
		p.required ?? false,
		(p.options ?? []).map((o) => [
			o.title,
			o.description ?? "",
			o.emoji ?? "",
			[...new Set((o.channels ?? []).map((c) => c.toLowerCase()))].sort(),
			[...new Set((o.roles ?? []).map((r) => r.toLowerCase()))].sort(),
		]),
	]);
const accessText = (v: AccessValue): string =>
	v === "everyone" ? "everyone" : v.length === 0 ? "nobody (bots and webhooks only)" : v.join(", ");
const shown = (s: string) => sanitizeDetail(s);
const WELCOME_TITLE = "welcome screen and onboarding set";
const APP_TITLE = "bot description, tags, install link and URLs set";
const AVATAR_TITLE = "webhook names and avatars set";
const SERVER_TITLE = "server verification, notifications and community set";
const ACCESS_TITLE = "channel and category access set";
const ROLE_APPEARANCE_TITLE = "role colour, hoist and permissions set";
const SECRETS_TITLE = "webhook URLs and role id stored as secrets";

export async function runDoctorNotifications(input: RunDoctorNotificationsInput): Promise<DoctorNotificationsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor notifications");

	const checks: NotificationsCheck[] = [];
	const add = (id: string, title: string, problems: string[], pass: string): void => {
		checks.push({
			id,
			title,
			status: problems.length === 0 ? "pass" : "fail",
			detail: problems.length === 0 ? pass : `${problems.length} problem(s)`,
			problems,
		});
	};
	const byId = (id: string) => checks.find((c) => c.id === id);
	const failed = (id: string, title: string, reason: string): void => {
		checks.push({ id, title, status: "fail", detail: reason, problems: [] });
	};

	const summarise = () => ({
		pass: checks.filter((c) => c.status === "pass").length,
		fail: checks.filter((c) => c.status === "fail").length,
		skip: input.builtOnly ? PLANNED_CHECKS.length : 0,
	});
	const finish = (): DoctorNotificationsReport => {
		const summary = summarise();
		const report: DoctorNotificationsReport = {
			status: summary.fail > 0 ? "fail" : "ok",
			checks,
			summary,
		};
		logger.info(
			{ ...summary, status: report.status, checks: checks.map((c) => `${c.id}:${c.status}`) },
			"doctor notifications"
		);
		return report;
	};
	const refuse = (message: string, reason: string = message): DoctorNotificationsReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "doctor notifications");
		return { status: "fail", checks, summary: summarise(), message };
	};

	let notifications: Notifications;
	try {
		// A provider that can only read is fine here: verify needs `inspect`, not provisioning.
		notifications = pickProvider(
			notificationProviders(loader),
			input.provider,
			(p) => typeof p.inspect === "function",
			{ infinitive: "inspect a server", gerund: "inspecting" }
		);
	} catch (err) {
		return refuse(describeProviderError(err));
	}
	const layout = notifications.layout;
	if (!layout) {
		return refuse(
			`the \`${notifications.providerName}\` provider declares no layout — add \`layout\` to its options in holocron.config.ts`
		);
	}

	// Read the server first: a provider with no `whoami` is still reachable if it can be read.
	let found: Awaited<ReturnType<NonNullable<Notifications["inspect"]>>> | undefined;
	let readError = "";
	try {
		found = await notifications.inspect!(layout);
	} catch (err) {
		readError = describeProviderError(err);
	}

	// 1. the server is reachable with the configured credentials
	if (notifications.whoami) {
		try {
			const who = await notifications.whoami();
			if (who) {
				checks.push({
					id: "server",
					title: "server reachable",
					status: "pass",
					detail: shown(who.target),
					problems: [],
				});
			} else {
				failed(
					"server",
					"server reachable",
					"no server configured (the provider's whoami has nothing to check)"
				);
			}
		} catch (err) {
			failed("server", "server reachable", describeProviderError(err));
		}
	} else if (found) {
		checks.push({
			id: "server",
			title: "server reachable",
			status: "pass",
			detail: "readable (the provider has no whoami)",
			problems: [],
		});
	} else {
		failed("server", "server reachable", readError);
	}

	const declaredChannels = (layout.categories ?? []).flatMap((cat) =>
		(cat.channels ?? []).map((channel) => ({ cat: cat.name, channel }))
	);
	const pick = (name: string, category: string) => {
		const named = found!.channels.filter((c) => same(c.name, name)); // only called once `found` is set
		return { named, match: named.find((c) => c.category !== undefined && same(c.category, category)) };
	};

	if (!found) {
		// The reason is shown once: the server step already carries it when the credentials are the problem.
		if (byId("server")?.status !== "fail") failed("read", "read server", readError);
		for (const [id, title] of [
			["categories", "categories exist"],
			["channels", "channels in their category, with topics"],
			["webhooks", "webhooks on their channels"],
			["webhook-appearance", AVATAR_TITLE],
			["roles", "roles exist and are mentionable"],
			["role-appearance", ROLE_APPEARANCE_TITLE],
			["access", ACCESS_TITLE],
			["server-settings", SERVER_TITLE],
			["welcome-onboarding", WELCOME_TITLE],
			["app-settings", APP_TITLE],
		] as const) {
			failed(id, title, "not checked: could not read the server");
		}
	} else {
		const inspected = found;
		// 2. categories
		const categories = layout.categories ?? [];
		add(
			"categories",
			"categories exist",
			categories
				.filter((cat) => !inspected.categories.some((name) => same(name, cat.name)))
				.map((cat) => `${shown(cat.name)}: missing`),
			categories.length === 0 ? "none declared" : `${categories.length} of ${categories.length} exist`
		);

		// 3. channels: exist, in the right category, with the right topic
		const channelProblems: string[] = [];
		for (const { cat, channel } of declaredChannels) {
			const { named, match } = pick(channel.name, cat);
			if (named.length === 0) {
				channelProblems.push(`#${shown(channel.name)}: missing`);
				continue;
			}
			if (!match) {
				const where = named.map((c) => c.category ?? "no category").join(", ");
				channelProblems.push(
					`#${shown(channel.name)}: exists, but under ${shown(where)} and not ${shown(cat)}`
				);
				continue;
			}
			// An empty topic means "unspecified": setup does not send one, so it cannot be made to match.
			if (channel.topic && (match.topic ?? "") !== channel.topic) {
				channelProblems.push(
					`#${shown(channel.name)}: topic is "${shown(match.topic ?? "")}" but the layout says "${shown(channel.topic)}"`
				);
			}
		}
		add(
			"channels",
			"channels in their category, with topics",
			channelProblems,
			declaredChannels.length === 0
				? "none declared"
				: `${declaredChannels.length} of ${declaredChannels.length} as declared`
		);

		// 4. webhooks exist on the channels that ask for one
		const withWebhook = declaredChannels.filter(({ channel }) => channel.webhook);
		const webhookProblems: string[] = [];
		for (const { cat, channel } of withWebhook) {
			const cfg = channel.webhook === true ? {} : (channel.webhook as { name?: string });
			const name = cfg.name ?? channel.name;
			const { match } = pick(channel.name, cat);
			if (!match) {
				webhookProblems.push(`#${shown(channel.name)}: no channel to hold the webhook`);
			} else if (match.webhooksError) {
				webhookProblems.push(
					`#${shown(channel.name)}: could not list its webhooks (${shown(match.webhooksError)})`
				);
			} else if (!match.webhooks.some((w) => same(w, name))) {
				webhookProblems.push(`#${shown(channel.name)}: no webhook named ${shown(name)}`);
			}
		}
		add(
			"webhooks",
			"webhooks on their channels",
			webhookProblems,
			withWebhook.length === 0 ? "none declared" : `${withWebhook.length} of ${withWebhook.length} exist`
		);

		// Webhook avatars: a webhook's name is checked with the webhooks above; its picture here.
		const avatarOf = (webhook: unknown) =>
			(typeof webhook === "object" && webhook ? (webhook as { avatar?: string }).avatar : undefined) ??
			layout.webhookAvatar;
		const wantAvatar = declaredChannels.filter(({ channel }) => channel.webhook && avatarOf(channel.webhook));
		const avatarProblems: string[] = [];
		for (const { cat, channel } of wantAvatar) {
			const cfg = channel.webhook === true ? {} : (channel.webhook as { name?: string });
			const name = cfg.name ?? channel.name;
			const { match } = pick(channel.name, cat);
			if (!match) {
				avatarProblems.push(`#${shown(channel.name)}: no channel to hold the webhook`);
			} else if (match.webhooksError) {
				avatarProblems.push(
					`#${shown(channel.name)}: could not list its webhooks (${shown(match.webhooksError)})`
				);
			} else if (match.webhookAvatars && !match.webhookAvatars.some((w) => same(w, name))) {
				avatarProblems.push(`#${shown(channel.name)}: webhook ${shown(name)} has no avatar`);
			}
		}
		add(
			"webhook-appearance",
			AVATAR_TITLE,
			avatarProblems,
			wantAvatar.length === 0 ? "none declared" : `${wantAvatar.length} of ${wantAvatar.length} set`
		);

		// 6. roles exist and are mentionable as declared
		const roles = layout.roles ?? [];
		const roleProblems: string[] = [];
		if (inspected.rolesError) {
			roleProblems.push(`could not read the roles (${shown(inspected.rolesError)})`);
		}
		for (const role of inspected.rolesError ? [] : roles) {
			const named = inspected.roles.filter((r) => same(r.name, role.name));
			const actual = named[0];
			if (named.length > 1) {
				roleProblems.push(
					`${shown(role.name)}: ${named.length} roles have this name; setup cannot tell which to manage`
				);
			} else if (!actual) {
				roleProblems.push(`${shown(role.name)}: missing`);
			} else if (role.mentionable !== undefined && actual.mentionable !== role.mentionable) {
				roleProblems.push(
					`${shown(role.name)}: mentionable is ${actual.mentionable} but the layout says ${role.mentionable}`
				);
			}
		}
		add(
			"roles",
			"roles exist and are mentionable",
			roleProblems,
			roles.length === 0 ? "none declared" : `${roles.length} of ${roles.length} as declared`
		);

		// 6b. role colour, hoist and permissions as declared (only what the layout states is compared)
		const appearance: string[] = [];
		if (!inspected.rolesError) {
			for (const role of roles) {
				const actual = inspected.roles.find((r) => same(r.name, role.name));
				if (!actual) {
					// The roles check says it is missing; this one cannot say anything about it either.
					appearance.push(`${shown(role.name)}: not checked, the role is missing`);
					continue;
				}
				if (role.color !== undefined && (actual.color ?? "").toLowerCase() !== role.color.toLowerCase()) {
					appearance.push(
						`${shown(role.name)}: colour is ${shown(actual.color ?? "default")} but the layout says ${shown(role.color)}`
					);
				}
				if (role.hoist !== undefined && (actual.hoist ?? false) !== role.hoist) {
					appearance.push(
						`${shown(role.name)}: hoist is ${actual.hoist ?? false} but the layout says ${role.hoist}`
					);
				}
				const reported = actual.permissions;
				if (role.permissions !== undefined) {
					if (reported === undefined) {
						appearance.push(`${shown(role.name)}: the provider did not report its permissions`);
					} else {
						const have = new Set(reported.map((n) => n.toLowerCase()));
						const want = new Set(role.permissions.map((n) => n.toLowerCase()));
						const missing = role.permissions.filter((n) => !have.has(n.toLowerCase()));
						const extra = reported.filter((n) => !want.has(n.toLowerCase()));
						if (missing.length > 0) {
							appearance.push(
								`${shown(role.name)}: missing permissions ${missing.map(shown).join(", ")}`
							);
						}
						if (extra.length > 0) {
							appearance.push(
								`${shown(role.name)}: has extra permissions ${extra.map(shown).join(", ")}`
							);
						}
					}
				}
			}
		}
		// What everyone may do is checked here too: it is the permissions of one more role.
		const everyone = layout.everyone;
		if (everyone) {
			if (inspected.everyoneError) {
				appearance.push(
					`@everyone: not checked, could not read its permissions (${shown(inspected.everyoneError)})`
				);
			} else if (!inspected.everyone) {
				appearance.push("@everyone: the provider did not report its permissions");
			} else {
				const have = new Set(inspected.everyone.permissions.map((n) => n.toLowerCase()));
				const lacking = (everyone.allow ?? []).filter((n) => !have.has(n.toLowerCase()));
				const keeping = (everyone.deny ?? []).filter((n) => have.has(n.toLowerCase()));
				if (lacking.length > 0)
					appearance.push(`@everyone: missing permissions ${lacking.map(shown).join(", ")}`);
				if (keeping.length > 0) {
					appearance.push(
						`@everyone: still has permissions the layout takes away: ${keeping.map(shown).join(", ")}`
					);
				}
			}
		}
		const styled = roles.filter(
			(r) => r.color !== undefined || r.hoist !== undefined || r.permissions !== undefined
		);
		const styledCount = styled.length + (everyone ? 1 : 0);
		add(
			"role-appearance",
			ROLE_APPEARANCE_TITLE,
			inspected.rolesError ? [`not checked: could not read the roles`] : appearance,
			styledCount === 0 ? "none declared" : `${styledCount} of ${styledCount} as declared`
		);

		// 6c. who can see and post, in the channels and categories the layout (or its category) gives an access
		const accessProblems: string[] = [];
		const compare = (
			label: string,
			want: NotificationsAccess,
			have: Required<NotificationsAccess> | "custom" | undefined
		) => {
			if (!have) {
				accessProblems.push(`${label}: the provider did not report its access`);
				return;
			}
			if (have === "custom") {
				accessProblems.push(
					`${label}: has permission overwrites that are not an access the layout can state; re-run setup to replace them`
				);
				return;
			}
			for (const field of ["view", "post"] as const) {
				const wanted = want[field] ?? "everyone";
				if (accessKey(wanted) !== accessKey(have[field])) {
					accessProblems.push(
						`${label}: ${field} is ${accessText(have[field])} but the layout says ${accessText(wanted)}`
					);
				}
			}
		};
		let accessDeclared = 0;
		for (const cat of categories) {
			if (cat.access) {
				accessDeclared++;
				if (!inspected.categories.some((name) => same(name, cat.name))) {
					accessProblems.push(`${shown(cat.name)}: not checked, the category is missing`);
				} else {
					const have = Object.entries(inspected.categoryAccess ?? {}).find(([n]) => same(n, cat.name))?.[1];
					compare(shown(cat.name), cat.access, have);
				}
			}
			for (const channel of cat.channels ?? []) {
				if (!cat.access && !channel.access) continue;
				accessDeclared++;
				const want = { ...cat.access, ...channel.access };
				const { match } = pick(channel.name, cat.name);
				if (!match) {
					accessProblems.push(`#${shown(channel.name)}: not checked, the channel is missing`);
				} else {
					compare(`#${shown(channel.name)}`, want, match.access);
				}
			}
		}
		add(
			"access",
			ACCESS_TITLE,
			// Access names roles by id on the server; without the roles read, the names cannot be compared.
			inspected.rolesError && accessDeclared > 0 ? ["not checked: could not read the roles"] : accessProblems,
			accessDeclared === 0 ? "none declared" : `${accessDeclared} of ${accessDeclared} as declared`
		);

		// 6d. the server's own settings, for the fields the layout states
		const wantServer = layout.server;
		const serverProblems: string[] = [];
		if (wantServer) {
			if (inspected.serverError) {
				serverProblems.push(
					`not checked: could not read the server settings (${shown(inspected.serverError)})`
				);
			} else if (!inspected.server) {
				serverProblems.push("the provider did not report the server's settings");
			} else {
				const have = inspected.server;
				for (const field of [
					"verification",
					"defaultNotifications",
					"contentFilter",
					"systemChannel",
					"rulesChannel",
					"updatesChannel",
					"community",
					"description",
					"locale",
				] as const) {
					const want = wantServer[field];
					if (want === undefined) continue;
					const actual = have[field];
					// Channel names are compared without regard to case (Discord lower-cases them); nothing else is.
					const isChannel =
						field === "systemChannel" || field === "rulesChannel" || field === "updatesChannel";
					const equal =
						isChannel && typeof want === "string" && typeof actual === "string"
							? same(want, actual)
							: want === actual;
					if (!equal) {
						serverProblems.push(
							`${field} is ${shown(String(actual ?? "not set"))} but the layout says ${shown(String(want))}`
						);
					}
				}
			}
		}
		const serverFields = wantServer ? Object.values(wantServer).filter((v) => v !== undefined).length : 0;
		add(
			"server-settings",
			SERVER_TITLE,
			serverProblems,
			serverFields === 0 ? "none declared" : `${serverFields} of ${serverFields} as declared`
		);

		// 6e. the welcome screen and onboarding, for the parts the layout declares
		const wantWelcome = layout.welcome;
		const wantOnboarding = layout.onboarding;
		const welcomeProblems: string[] = [];
		if (wantWelcome) {
			if (inspected.welcomeError) {
				welcomeProblems.push(
					`not checked: could not read the welcome screen (${shown(inspected.welcomeError)})`
				);
			} else if (!inspected.welcome) {
				welcomeProblems.push("the provider did not report the welcome screen");
			} else {
				const have = inspected.welcome;
				const enabled = wantWelcome.enabled ?? true;
				if (have.enabled !== enabled) {
					welcomeProblems.push(
						`welcome screen is ${have.enabled ? "on" : "off"} but the layout says ${enabled ? "on" : "off"}`
					);
				}
				if (have.description !== wantWelcome.description) {
					welcomeProblems.push(
						`welcome description is "${shown(have.description)}" but the layout says "${shown(wantWelcome.description)}"`
					);
				}
				const key = (list: NotificationsWelcomeLayout["channels"]) =>
					JSON.stringify(list.map((c) => [c.channel.toLowerCase(), c.description, c.emoji ?? ""]));
				if (key(have.channels) !== key(wantWelcome.channels)) {
					const names = (list: NotificationsWelcomeLayout["channels"]) =>
						list.length === 0 ? "none" : list.map((c) => shown(c.channel)).join(", ");
					welcomeProblems.push(
						`welcome channels are ${names(have.channels)} but the layout says ${names(wantWelcome.channels)} (or their descriptions or emoji differ)`
					);
				}
			}
		}
		const onboardingProblems: string[] = [];
		if (wantOnboarding) {
			if (inspected.onboardingError) {
				onboardingProblems.push(`not checked: could not read onboarding (${shown(inspected.onboardingError)})`);
			} else if (!inspected.onboarding) {
				onboardingProblems.push("the provider did not report onboarding");
			} else {
				const have = inspected.onboarding;
				if (wantOnboarding.enabled !== undefined && have.enabled !== wantOnboarding.enabled) {
					onboardingProblems.push(
						`onboarding is ${have.enabled ? "on" : "off"} but the layout says ${wantOnboarding.enabled ? "on" : "off"}`
					);
				}
				if (wantOnboarding.defaultChannels !== undefined) {
					const set = (list: string[]) => [...new Set(list.map((c) => c.toLowerCase()))].sort().join(",");
					if (set(have.defaultChannels ?? []) !== set(wantOnboarding.defaultChannels)) {
						onboardingProblems.push(
							`default channels are ${(have.defaultChannels ?? []).map(shown).join(", ") || "none"} but the layout says ${wantOnboarding.defaultChannels.map(shown).join(", ") || "none"}`
						);
					}
				}
				if (wantOnboarding.prompts !== undefined) {
					const found = new Map((have.prompts ?? []).map((p) => [p.title, p] as const));
					for (const p of wantOnboarding.prompts) {
						const actual = found.get(p.title);
						if (!actual) onboardingProblems.push(`question "${shown(p.title)}" is missing`);
						else if (promptKey(actual) !== promptKey(p))
							onboardingProblems.push(`question "${shown(p.title)}" differs from the layout`);
						found.delete(p.title);
					}
					for (const title of found.keys())
						onboardingProblems.push(`question "${shown(title)}" is not in the layout`);
					const order = (titles: string[]) => titles.join("\u0000");
					const wantedTitles = wantOnboarding.prompts.map((p) => p.title);
					const haveTitles = (have.prompts ?? []).map((p) => p.title).filter((t) => wantedTitles.includes(t));
					if (haveTitles.length === wantedTitles.length && order(haveTitles) !== order(wantedTitles))
						onboardingProblems.push("the questions are in a different order from the layout");
				}
			}
		}
		const welcomeParts = (wantWelcome ? 1 : 0) + (wantOnboarding ? 1 : 0);
		add(
			"welcome-onboarding",
			WELCOME_TITLE,
			[...welcomeProblems, ...onboardingProblems],
			welcomeParts === 0 ? "none declared" : `${welcomeParts} of ${welcomeParts} as declared`
		);

		const wantApp = layout.application;
		const appProblems: string[] = [];
		if (wantApp) {
			if (inspected.applicationError) {
				appProblems.push(`not checked: could not read the application (${shown(inspected.applicationError)})`);
			} else if (!inspected.application) {
				appProblems.push("the provider did not report the application");
			} else {
				const have = inspected.application;
				const set = (list: string[]) => [...new Set(list.map((n) => n.toLowerCase()))].sort().join(",");
				if (wantApp.description !== undefined && (have.description ?? "") !== wantApp.description) {
					appProblems.push("description differs from the layout");
				}
				if (wantApp.tags !== undefined && set(have.tags ?? []) !== set(wantApp.tags)) {
					appProblems.push(
						`tags are ${(have.tags ?? []).map(shown).join(", ") || "none"} but the layout says ${wantApp.tags.map(shown).join(", ") || "none"}`
					);
				}
				if (wantApp.install !== undefined) {
					if (!have.install) {
						appProblems.push("no install link is set");
					} else {
						if (set(have.install.scopes) !== set(wantApp.install.scopes)) {
							appProblems.push(
								`install scopes are ${have.install.scopes.map(shown).join(", ")} but the layout says ${wantApp.install.scopes.map(shown).join(", ")}`
							);
						}
						if (set(have.install.permissions) !== set(wantApp.install.permissions)) {
							appProblems.push("install permissions differ from the layout");
						}
					}
				}
				for (const [field, label] of [
					["termsUrl", "terms URL"],
					["privacyUrl", "privacy URL"],
					["roleConnectionsUrl", "role-connections URL"],
				] as const) {
					const wanted = wantApp[field];
					if (wanted !== undefined && (have[field] ?? "") !== wanted) {
						appProblems.push(
							`${label} is ${shown(have[field] || "not set")} but the layout says ${shown(wanted)}`
						);
					}
				}
			}
		}
		add("app-settings", APP_TITLE, appProblems, wantApp ? "1 of 1 as declared" : "none declared");
	}

	// 5. the secrets the layout fills exist in the org
	const wanted: string[] = [
		...declaredChannels
			.filter(({ channel }) => channel.webhook)
			.map(({ channel }) =>
				channel.webhook !== true && channel.webhook && channel.webhook.secret
					? channel.webhook.secret
					: defaultSecretName(channel.name)
			),
		...(layout.roles ?? []).flatMap((r) => (r.secret ? [r.secret] : [])),
	];
	if (wanted.length === 0) {
		checks.push({ id: "secrets", title: SECRETS_TITLE, status: "pass", detail: "none declared", problems: [] });
	} else if (!loader.has("secrets")) {
		failed("secrets", SECRETS_TITLE, whyMissing(loader, "secrets", "no `secrets` provider to check them with"));
	} else {
		const org = input.context.org;
		const scope = input.scope ?? (org ? ({ kind: "organization", name: org } as const) : undefined);
		if (!scope) {
			failed("secrets", SECRETS_TITLE, "no org to look under — pass --scope or set `org` in holocron.config.ts");
		} else {
			try {
				const have = new Set(
					(await (loader.get("secrets") as Secrets).listSecrets(scope)).map((n) => n.toUpperCase())
				);
				// A layout whose names collide cannot be provisioned (setup refuses it), so it cannot pass here either.
				const clash = layoutSecretProblem(layout);
				add(
					"secrets",
					SECRETS_TITLE,
					[
						...(clash ? [shown(clash)] : []),
						...wanted.filter((n) => !have.has(n.toUpperCase())).map((n) => `${shown(n)}: missing`),
					],
					`${wanted.length} of ${wanted.length} exist`
				);
			} catch (err) {
				failed("secrets", SECRETS_TITLE, describeProviderError(err));
			}
		}
	}

	// Features not built yet: each fails until it lands.
	if (!input.builtOnly) {
		for (const planned of PLANNED_CHECKS) {
			checks.push({
				id: planned.id,
				title: planned.title,
				status: "fail",
				detail: `not built yet (#1098, step ${planned.step})`,
				problems: [],
				step: planned.step,
			});
		}
	}

	// Render in one place so the output order is the check order.
	const width = Math.max(...checks.map((c) => c.title.length));
	for (const check of checks) {
		print(statusRow(check.status === "pass" ? "ok" : "fail", [check.title.padEnd(width), check.detail]));
		for (const problem of check.problems) print(`      - ${problem}`);
	}
	const summary = summarise();
	print("");
	print(style.header(`${summary.pass} ok, ${summary.fail} fail, ${summary.skip} skipped`));
	return finish();
}
