/**
 * `holocron notifications verify` -- read-only: compare the layout a provider
 * declares in `holocron.config.ts` with what is actually on the server and in the
 * secrets store, step by step.
 *
 * It is the end-to-end check for `notifications setup`, and stays useful after
 * as a drift check. Everything the layout and `setup` cannot do yet is listed
 * too, as a failing "not built" step, so the command is red until the last
 * feature lands and each feature built turns exactly one step green. The list
 * is {@link PLANNED_CHECKS}; the numbers match the table in holocron#1098.
 */

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Notifications, PluginLoader, type Secrets } from "../../plugin/index.js";
import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
import { defaultSecretName, pickProvisioner, whyMissing } from "../notifications-channel-add/index.js";
import type {
	NotificationsVerifyReport,
	RunNotificationsVerifyInput,
	VerifyCheck,
} from "./notifications-verify.type.js";

/** Features not built yet, in the order of the table in holocron#1098. Move an entry into a real check when it lands. */
export const PLANNED_CHECKS: ReadonlyArray<{ step: number; id: string; title: string }> = [
	{ step: 8, id: "permissions", title: "channel and category permissions" },
	{ step: 9, id: "role-appearance", title: "role colour, hoist and permissions" },
	{ step: 10, id: "server-settings", title: "server settings (verification, notifications, system channels)" },
	{ step: 11, id: "welcome", title: "welcome and onboarding content" },
	{ step: 12, id: "webhook-appearance", title: "webhook names and avatars" },
	{ step: 13, id: "app-settings", title: "bot application settings (description, tags, install, links)" },
	{ step: 14, id: "role-assignment", title: "role assigned to team members" },
	{ step: 15, id: "post-works", title: "a test post reached every channel (platform.notifyCheck)" },
	{ step: 16, id: "server-creation", title: "the server itself created from config" },
];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shown = (s: string) => sanitizeDetail(s);

export async function runNotificationsVerify(input: RunNotificationsVerifyInput): Promise<NotificationsVerifyReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications verify");

	const checks: VerifyCheck[] = [];
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
		planned: checks.filter((c) => c.status === "planned").length,
	});
	const finish = (): NotificationsVerifyReport => {
		const summary = summarise();
		const report: NotificationsVerifyReport = {
			status: summary.fail + summary.planned > 0 ? "fail" : "ok",
			checks,
			summary,
		};
		logger.info(
			{ ...summary, status: report.status, checks: checks.map((c) => `${c.id}:${c.status}`) },
			"notifications verify"
		);
		return report;
	};
	const refuse = (message: string, reason: string = message): NotificationsVerifyReport => {
		print(`  ✗ ${message}`);
		logger.warn({ reason }, "notifications verify");
		return { status: "fail", checks, summary: summarise(), message };
	};

	let notifications: Notifications;
	try {
		notifications = pickProvisioner(loader.has("notifications") ? loader.get("notifications") : [], input.provider);
	} catch (err) {
		return refuse(describeProviderError(err));
	}
	const layout = notifications.layout;
	if (!layout) {
		return refuse(
			`the \`${notifications.providerName}\` provider declares no layout — add \`layout\` to its options in holocron.config.ts`
		);
	}
	print(`Holocron notifications verify — ${notifications.providerName}\n`);

	// 1. the server is reachable with the configured credentials
	try {
		const who = notifications.whoami ? await notifications.whoami() : null;
		if (who) {
			checks.push({ id: "server", title: "server", status: "pass", detail: shown(who.target), problems: [] });
		} else {
			failed("server", "server", "no server configured, or the provider cannot be checked");
		}
	} catch (err) {
		failed("server", "server", describeProviderError(err));
	}

	// Everything below compares against what is actually on the server.
	let found: Awaited<ReturnType<NonNullable<Notifications["inspect"]>>> | undefined;
	let readError = "";
	try {
		if (!notifications.inspect)
			throw new Error(`the \`${notifications.providerName}\` provider cannot inspect a server`);
		found = await notifications.inspect(layout);
	} catch (err) {
		readError = describeProviderError(err);
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
			["categories", "categories"],
			["channels", "channels"],
			["webhooks", "webhooks"],
			["roles", "roles"],
		] as const) {
			failed(id, title, "not checked: could not read the server");
		}
	} else {
		const inspected = found;
		// 2. categories
		const categories = layout.categories ?? [];
		add(
			"categories",
			"categories",
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
			if (channel.topic !== undefined && (match.topic ?? "") !== channel.topic) {
				channelProblems.push(
					`#${shown(channel.name)}: topic is "${shown(match.topic ?? "")}" but the layout says "${shown(channel.topic)}"`
				);
			}
		}
		add(
			"channels",
			"channels",
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
			} else if (!match.webhooks.some((w) => same(w, name))) {
				webhookProblems.push(`#${shown(channel.name)}: no webhook named ${shown(name)}`);
			}
		}
		add(
			"webhooks",
			"webhooks",
			webhookProblems,
			withWebhook.length === 0 ? "none declared" : `${withWebhook.length} of ${withWebhook.length} exist`
		);

		// 6. roles exist and are mentionable as declared
		const roles = layout.roles ?? [];
		const roleProblems: string[] = [];
		for (const role of roles) {
			const actual = inspected.roles.find((r) => same(r.name, role.name));
			if (!actual) {
				roleProblems.push(`${shown(role.name)}: missing`);
			} else if (role.mentionable !== undefined && actual.mentionable !== role.mentionable) {
				roleProblems.push(
					`${shown(role.name)}: mentionable is ${actual.mentionable} but the layout says ${role.mentionable}`
				);
			}
		}
		add(
			"roles",
			"roles",
			roleProblems,
			roles.length === 0 ? "none declared" : `${roles.length} of ${roles.length} as declared`
		);
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
		checks.push({ id: "secrets", title: "secrets", status: "pass", detail: "none declared", problems: [] });
	} else if (!loader.has("secrets")) {
		failed("secrets", "secrets", whyMissing(loader, "secrets", "no `secrets` provider to check them with"));
	} else {
		const org = input.context.org;
		const scope = input.scope ?? (org ? ({ kind: "organization", name: org } as const) : undefined);
		if (!scope) {
			failed("secrets", "secrets", "no org to look under — pass --scope or set `org` in holocron.config.ts");
		} else {
			try {
				const have = new Set(
					(await (loader.get("secrets") as Secrets).listSecrets(scope)).map((n) => n.toUpperCase())
				);
				add(
					"secrets",
					"secrets",
					wanted.filter((n) => !have.has(n.toUpperCase())).map((n) => `${shown(n)}: missing`),
					`${wanted.length} of ${wanted.length} exist`
				);
			} catch (err) {
				failed("secrets", "secrets", describeProviderError(err));
			}
		}
	}

	// Features not built yet: each fails until it lands.
	if (!input.builtOnly) {
		for (const planned of PLANNED_CHECKS) {
			checks.push({
				id: planned.id,
				title: planned.title,
				status: "planned",
				detail: `not built yet (#1098, step ${planned.step})`,
				problems: [],
				step: planned.step,
			});
		}
	}

	// Render in one place so the output order is the check order. The features
	// not built yet go in their own short list: their titles are long, and they
	// would otherwise push every real result off to the right.
	const built = checks.filter((c) => c.status !== "planned");
	const width = Math.max(...built.map((c) => c.title.length));
	for (const check of built) {
		print(`  ${check.status === "pass" ? "✓" : "✗"} ${check.title.padEnd(width)}  ${check.detail}`);
		for (const problem of check.problems) print(`      - ${problem}`);
	}
	const planned = checks.filter((c) => c.status === "planned");
	if (planned.length > 0) {
		print("\nNot built yet (each fails until it lands, see #1098):");
		for (const check of planned) print(`  ✗ ${String(check.step).padStart(2)}  ${check.title}`);
	}
	const summary = summarise();
	print(`\n${summary.pass} passed, ${summary.fail} failed${input.builtOnly ? "" : `, ${summary.planned} not built`}`);
	return finish();
}
