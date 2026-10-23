import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout, ServerInspection } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { PLANNED_CHECKS, runNotificationsVerify } from "./notifications-verify.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(rawConfig), filepath: "/tmp/test/holocron.config.json" };
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoader(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

const LAYOUT: NotificationsLayout = {
	categories: [
		{
			name: "ALERTS",
			channels: [
				{ name: "alerts", topic: "needs a human", webhook: { secret: "HOLOCRON_NOTIFY_WEBHOOK_ALERTS" } },
				{ name: "errors" },
			],
		},
		{ name: "AUTOMATION", channels: [{ name: "sync", webhook: true }] },
	],
	roles: [{ name: "gatekeepers", mentionable: true, secret: "HOLOCRON_NOTIFY_ALERT_ROLE" }],
};

const GOOD: ServerInspection = {
	categories: ["ALERTS", "AUTOMATION"],
	channels: [
		{ name: "alerts", category: "ALERTS", topic: "needs a human", webhooks: ["alerts"] },
		{ name: "errors", category: "ALERTS", webhooks: [] },
		{ name: "sync", category: "AUTOMATION", webhooks: ["sync"] },
	],
	roles: [{ name: "gatekeepers", id: "99", mentionable: true }],
};

const SECRETS_GOOD = ["HOLOCRON_NOTIFY_WEBHOOK_ALERTS", "HOLOCRON_NOTIFY_WEBHOOK_SYNC", "HOLOCRON_NOTIFY_ALERT_ROLE"];

function fakeNotifications(over: Partial<Notifications> & { found?: ServerInspection } = {}): Notifications {
	const { found = GOOD, ...rest } = over;
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		whoami: vi.fn(async () => ({ target: "Holocron (as Holonet)" })),
		inspect: vi.fn(async () => found),
		ensureCategory: vi.fn(async () => ({ id: "c", created: true })),
		ensureChannel: vi.fn(async () => ({ id: "1", created: true })),
		ensureWebhook: vi.fn(async () => ({ created: true, url: "https://hook/x" })),
		ensureRole: vi.fn(async () => ({ id: "99", created: true })),
		...rest,
	} as Notifications;
}

function setup(
	notifications: Notifications,
	opts: {
		secretNames?: string[] | Error;
		secrets?: boolean;
		org?: string;
		builtOnly?: boolean;
		scope?: { kind: "repo" };
	} = {}
) {
	const loaded = loadedFrom({
		name: "demo",
		providers: { notifications: ["discord"], ...(opts.secrets === false ? {} : { secrets: "github" }) },
	});
	const setSecret = vi.fn(async () => {});
	const listSecrets = vi.fn(async () => {
		if (opts.secretNames instanceof Error) throw opts.secretNames;
		return opts.secretNames ?? SECRETS_GOOD;
	});
	const loader = makeLoader(loaded, {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		"@theholocron/holocron-plugin-github": makePlugin("gh", {
			secrets: { providerName: "github", listSecrets, setSecret, deleteSecret: async () => {} },
		}),
	});
	const lines: string[] = [];
	const log = fakeLogger();
	return {
		lines,
		log,
		listSecrets,
		setSecret,
		run: () =>
			runNotificationsVerify({
				loaded,
				context: {
					repoRoot: "/tmp/test",
					...("org" in opts ? (opts.org ? { org: opts.org } : {}) : { org: "theholocron" }),
				},
				loader,
				print: (l) => lines.push(l),
				logger: log,
				...(opts.builtOnly ? { builtOnly: true } : {}),
				...(opts.scope ? { scope: opts.scope } : {}),
			}),
	};
}

const byId = (r: Awaited<ReturnType<typeof runNotificationsVerify>>, id: string) => r.checks.find((c) => c.id === id)!;
const REAL = ["server", "categories", "channels", "webhooks", "roles", "secrets"];

describe("runNotificationsVerify — a server that matches the layout", () => {
	it("passes every built check, and still fails because the unbuilt features are listed as failing", async () => {
		const { run } = setup(fakeNotifications());
		const report = await run();
		expect(REAL.map((id) => byId(report, id).status)).toEqual(REAL.map(() => "pass"));
		expect(report.summary).toEqual({ pass: 6, fail: 0, planned: PLANNED_CHECKS.length });
		expect(report.status).toBe("fail");
		const planned = report.checks.filter((c) => c.status === "planned");
		expect(planned.map((c) => c.id)).toEqual(PLANNED_CHECKS.map((p) => p.id));
		expect(planned[0]?.detail).toBe("not built yet (#1098, step 8)");
	});

	it("is green with --built-only, which leaves the unbuilt features out", async () => {
		const { run, lines } = setup(fakeNotifications(), { builtOnly: true });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(report.checks.map((c) => c.id)).toEqual(REAL);
		expect(lines.join("\n")).toContain("6 passed, 0 failed");
		expect(lines.join("\n")).not.toContain("not built");
	});

	it("renders one line per check and ends with a count", async () => {
		const { run, lines } = setup(fakeNotifications());
		await run();
		const out = lines.join("\n");
		expect(out).toContain("Holocron notifications verify — discord");
		expect(out).toContain("✓ server");
		expect(out).toContain("Holocron (as Holonet)");
		expect(out).toContain("Not built yet (each fails until it lands, see #1098):");
		expect(out).toContain("✗  8  channel and category permissions");
		expect(out).toContain("✗ 16  the server itself created from config");
		expect(out).toContain("6 passed, 0 failed, 9 not built");
	});

	it("changes nothing: no provisioning call and no secret is written", async () => {
		const n = fakeNotifications();
		const { run, setSecret } = setup(n);
		await run();
		const calls = (["ensureCategory", "ensureChannel", "ensureWebhook", "ensureRole"] as const).map(
			(m) => (n[m] as ReturnType<typeof vi.fn>).mock.calls.length
		);
		expect(calls).toEqual([0, 0, 0, 0]);
		expect(setSecret).not.toHaveBeenCalled();
	});

	it("matches names case-insensitively, as Discord and GitHub do", async () => {
		const found: ServerInspection = {
			...GOOD,
			categories: ["alerts", "Automation"],
			channels: GOOD.channels.map((c) => ({ ...c, category: c.category?.toLowerCase() })),
			roles: [{ name: "GateKeepers", id: "99", mentionable: true }],
		};
		const report = await setup(fakeNotifications({ found }), {
			secretNames: SECRETS_GOOD.map((n) => n.toLowerCase()),
		}).run();
		expect(REAL.map((id) => byId(report, id).status)).toEqual(REAL.map(() => "pass"));
	});
});

describe("runNotificationsVerify — drift is reported with what is wrong", () => {
	it("a missing category", async () => {
		const found = { ...GOOD, categories: ["ALERTS"] };
		const c = byId(await setup(fakeNotifications({ found })).run(), "categories");
		expect(c.status).toBe("fail");
		expect(c.problems).toEqual(["AUTOMATION: missing"]);
	});

	it("a missing channel, a channel under the wrong category, and a different topic", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [
				{ name: "alerts", category: "ALERTS", topic: "old topic", webhooks: ["alerts"] },
				{ name: "sync", category: "ALERTS", webhooks: ["sync"] },
			],
		};
		const c = byId(await setup(fakeNotifications({ found })).run(), "channels");
		expect(c.status).toBe("fail");
		expect(c.problems).toEqual([
			'#alerts: topic is "old topic" but the layout says "needs a human"',
			"#errors: missing",
			"#sync: exists, but under ALERTS and not AUTOMATION",
		]);
	});

	it("prefers the same-named channel that is under the declared category", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [...GOOD.channels, { name: "sync", category: "ALERTS", webhooks: [] }],
		};
		expect(byId(await setup(fakeNotifications({ found })).run(), "channels").status).toBe("pass");
	});

	it("a missing webhook, and a channel with nowhere to hold one", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [
				{ name: "alerts", category: "ALERTS", topic: "needs a human", webhooks: ["something else"] },
				{ name: "errors", category: "ALERTS", webhooks: [] },
			],
		};
		const c = byId(await setup(fakeNotifications({ found })).run(), "webhooks");
		expect(c.problems).toEqual(["#alerts: no webhook named alerts", "#sync: no channel to hold the webhook"]);
	});

	it("honours a webhook's own display name", async () => {
		const layout: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "alerts", webhook: { name: "repo-sync" } }] }],
		};
		const found: ServerInspection = {
			categories: ["A"],
			channels: [{ name: "alerts", category: "A", webhooks: ["repo-sync"] }],
			roles: [],
		};
		const report = await setup(fakeNotifications({ layout, found }), {
			secretNames: ["HOLOCRON_NOTIFY_WEBHOOK_ALERTS"],
		}).run();
		expect(byId(report, "webhooks").status).toBe("pass");
	});

	it("a missing role, and a role that is not mentionable when the layout says it is", async () => {
		const missing = byId(await setup(fakeNotifications({ found: { ...GOOD, roles: [] } })).run(), "roles");
		expect(missing.problems).toEqual(["gatekeepers: missing"]);
		const unmentionable = byId(
			await setup(
				fakeNotifications({
					found: { ...GOOD, roles: [{ name: "gatekeepers", id: "99", mentionable: false }] },
				})
			).run(),
			"roles"
		);
		expect(unmentionable.problems).toEqual(["gatekeepers: mentionable is false but the layout says true"]);
	});

	it("does not care about mentionable when the layout does not say", async () => {
		const layout: NotificationsLayout = { roles: [{ name: "gatekeepers" }] };
		const found = { ...GOOD, roles: [{ name: "gatekeepers", id: "99", mentionable: false }] };
		expect(byId(await setup(fakeNotifications({ layout, found })).run(), "roles").status).toBe("pass");
	});

	it("missing secrets, by name", async () => {
		const c = byId(
			await setup(fakeNotifications(), { secretNames: ["HOLOCRON_NOTIFY_WEBHOOK_SYNC"] }).run(),
			"secrets"
		);
		expect(c.status).toBe("fail");
		expect(c.problems).toEqual(["HOLOCRON_NOTIFY_WEBHOOK_ALERTS: missing", "HOLOCRON_NOTIFY_ALERT_ROLE: missing"]);
	});

	it("uses the default secret name for a webhook that does not name one", async () => {
		const c = byId(
			await setup(fakeNotifications(), {
				secretNames: ["HOLOCRON_NOTIFY_WEBHOOK_ALERTS", "HOLOCRON_NOTIFY_ALERT_ROLE"],
			}).run(),
			"secrets"
		);
		expect(c.problems).toEqual(["HOLOCRON_NOTIFY_WEBHOOK_SYNC: missing"]);
	});
});

describe("runNotificationsVerify — when a step cannot run", () => {
	it("reports a server that cannot be reached, and says the dependent checks were not checked", async () => {
		const n = fakeNotifications({
			whoami: vi.fn(async () => {
				throw new ProviderApiError("Discord GET /users/@me → 401", 401, '{"message":"401: Unauthorized"}');
			}),
			inspect: vi.fn(async () => {
				throw new ProviderApiError(
					"Discord GET /guilds/1/channels → 401",
					401,
					'{"message":"401: Unauthorized"}'
				);
			}),
		});
		const report = await setup(n).run();
		expect(byId(report, "server").detail).toContain("401: Unauthorized");
		for (const id of ["categories", "channels", "webhooks", "roles"]) {
			expect(byId(report, id).status).toBe("fail");
			expect(byId(report, id).detail).toBe("not checked: could not read the server");
		}
		expect(byId(report, "secrets").status).toBe("pass");
		// The credentials are already blamed on the server step, so the reason is not printed a second time.
		expect(report.checks.some((c) => c.id === "read")).toBe(false);
	});

	it("when the server is fine but cannot be read, says why once, on its own line", async () => {
		const n = fakeNotifications({
			inspect: vi.fn(async () => {
				throw new ProviderApiError("Discord GET /guilds/1/channels → 403", 403, '{"message":"Missing Access"}');
			}),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(byId(report, "server").status).toBe("pass");
		expect(byId(report, "read").detail).toContain("Missing Access");
		expect(lines.join("\n").match(/Missing Access/g)).toHaveLength(1);
	});

	it("fails the server step when no server is configured", async () => {
		const report = await setup(fakeNotifications({ whoami: vi.fn(async () => null) })).run();
		expect(byId(report, "server")).toMatchObject({
			status: "fail",
			detail: expect.stringMatching(/no server configured/),
		});
	});

	it("fails the server step when the provider has no whoami", async () => {
		const report = await setup(fakeNotifications({ whoami: undefined })).run();
		expect(byId(report, "server").status).toBe("fail");
	});

	it("says so when the provider cannot inspect a server", async () => {
		const report = await setup(fakeNotifications({ inspect: undefined })).run();
		expect(byId(report, "read")).toMatchObject({
			status: "fail",
			detail: expect.stringMatching(/cannot inspect a server/),
		});
		expect(byId(report, "channels").detail).toBe("not checked: could not read the server");
	});

	it("reports an unreachable secrets store with the provider's reason, and still checks the rest", async () => {
		const err = new ProviderApiError(
			"GitHub GET /orgs/theholocron/actions/secrets → 403",
			403,
			'{"message":"Resource not accessible"}'
		);
		const report = await setup(fakeNotifications(), { secretNames: err }).run();
		expect(byId(report, "secrets").detail).toContain("Resource not accessible");
		expect(byId(report, "channels").status).toBe("pass");
	});

	it("fails the secrets step when there is no secrets provider", async () => {
		const report = await setup(fakeNotifications(), { secrets: false }).run();
		expect(byId(report, "secrets")).toMatchObject({
			status: "fail",
			detail: expect.stringMatching(/no `secrets` provider/),
		});
	});

	it("fails the secrets step when there is no org or scope to look under", async () => {
		const report = await setup(fakeNotifications(), { org: "" }).run();
		expect(byId(report, "secrets").detail).toMatch(/no org to look under/);
	});

	it("looks under an explicit scope", async () => {
		const { run, listSecrets } = setup(fakeNotifications(), { org: "", scope: { kind: "repo" } });
		await run();
		expect(listSecrets).toHaveBeenCalledWith({ kind: "repo" });
	});

	it("passes the secrets step quietly when the layout fills none", async () => {
		const layout: NotificationsLayout = { categories: [{ name: "BUILD", channels: [{ name: "dev" }] }] };
		const found: ServerInspection = {
			categories: ["BUILD"],
			channels: [{ name: "dev", category: "BUILD", webhooks: [] }],
			roles: [],
		};
		const { run, listSecrets } = setup(fakeNotifications({ layout, found }), { secrets: false, org: "" });
		const report = await run();
		expect(byId(report, "secrets")).toMatchObject({ status: "pass", detail: "none declared" });
		expect(byId(report, "roles").detail).toBe("none declared");
		expect(listSecrets).not.toHaveBeenCalled();
	});

	it("handles a layout with no categories at all", async () => {
		const layout: NotificationsLayout = { roles: [{ name: "gatekeepers" }] };
		const report = await setup(fakeNotifications({ layout, found: GOOD })).run();
		expect(byId(report, "categories").detail).toBe("none declared");
		expect(byId(report, "channels").detail).toBe("none declared");
		expect(byId(report, "webhooks").detail).toBe("none declared");
	});
});

describe("runNotificationsVerify — refusals", () => {
	it("refuses, and says why, when the provider declares no layout", async () => {
		const { run, lines } = setup(fakeNotifications({ layout: undefined }));
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/declares no layout/);
		expect(lines.join("\n")).toContain("✗ the `discord` provider declares no layout");
	});

	it("refuses when no notifications provider can be inspected", async () => {
		const post = { key: "notifications", providerName: "slack", send: async () => {} } as Notifications;
		expect(await setup(post).run()).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/can provision/),
		});
	});
});

describe("runNotificationsVerify — output and logs", () => {
	it("keeps terminal control characters from a server's names off the screen", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [
				{
					name: "alerts",
					category: "ALERTS",
					topic: "bad\u001b[2J\u009btopic\nFAKE ROW",
					webhooks: ["alerts"],
				},
				...GOOD.channels.slice(1),
			],
		};
		const { run, lines } = setup(fakeNotifications({ found }));
		await run();
		const out = lines.join("\n");
		expect(out.includes("\u001b") || out.includes("\u009b")).toBe(false);
		expect(out).toContain('topic is "bad [2J topic FAKE ROW"');
	});

	it("logs only the verdicts, never the detail of what was found", async () => {
		const found = {
			...GOOD,
			channels: [{ name: "alerts", category: "ALERTS", topic: "SECRET-LOOKING TOPIC", webhooks: ["alerts"] }],
		};
		const { run, log } = setup(fakeNotifications({ found }));
		await run();
		const logged = JSON.stringify(log.info.mock.calls);
		expect(logged).toContain("channels:fail");
		expect(logged).not.toContain("SECRET-LOOKING TOPIC");
	});

	it("prints to the console when no print function is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", {
				notifications: fakeNotifications({ layout: { roles: [] } }),
			}),
		});
		await runNotificationsVerify({ loaded, context: { repoRoot: "/tmp/test" }, loader });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("notifications verify — discord"));
		log.mockRestore();
	});
});

describe("PLANNED_CHECKS", () => {
	it("numbers the steps 8..16 in order, matching the table in #1098, with no duplicates", () => {
		expect(PLANNED_CHECKS.map((p) => p.step)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
		expect(new Set(PLANNED_CHECKS.map((p) => p.id)).size).toBe(PLANNED_CHECKS.length);
	});
});

describe("runNotificationsVerify — edge cases in what the server holds", () => {
	it("refuses when no notifications provider is configured at all", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { secrets: "github" } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: { providerName: "github", listSecrets: async () => [] },
			}),
		});
		const report = await runNotificationsVerify({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});
		expect(report).toMatchObject({ status: "fail", message: expect.stringMatching(/can provision/) });
	});

	it("does not mind a declared category that has no channels", async () => {
		const layout: NotificationsLayout = { categories: [{ name: "EMPTY" }] };
		const found: ServerInspection = { categories: ["EMPTY"], channels: [], roles: [] };
		const report = await setup(fakeNotifications({ layout, found }), { secrets: false, org: "" }).run();
		expect(byId(report, "categories").status).toBe("pass");
		expect(byId(report, "channels").detail).toBe("none declared");
	});

	it("says a channel with no category is not under the declared one", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [...GOOD.channels.filter((c) => c.name !== "sync"), { name: "sync", webhooks: ["sync"] }],
		};
		const c = byId(await setup(fakeNotifications({ found })).run(), "channels");
		expect(c.problems).toEqual(["#sync: exists, but under no category and not AUTOMATION"]);
	});

	it("reports a topic the channel does not have at all", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [{ name: "alerts", category: "ALERTS", webhooks: ["alerts"] }, ...GOOD.channels.slice(1)],
		};
		const c = byId(await setup(fakeNotifications({ found })).run(), "channels");
		expect(c.problems).toEqual(['#alerts: topic is "" but the layout says "needs a human"']);
	});
});
