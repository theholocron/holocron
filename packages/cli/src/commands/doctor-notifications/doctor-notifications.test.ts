import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout, ServerInspection } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { PLANNED_CHECKS, runDoctorNotifications } from "./doctor-notifications.js";

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
		checkDelivery: vi.fn(async () => ({ posted: true, readBack: true, removed: true, problems: [] })),
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
		deliver?: boolean;
		scope?: { kind: "repo" };
		fetch?: typeof fetch;
	} = {}
) {
	const loaded = loadedFrom({
		name: "demo",
		providers: { notifications: ["discord"], ...(opts.secrets === false ? {} : { secrets: "github" }) },
	});
	const setSecret = vi.fn(async () => {});
	const deleteSecret = vi.fn(async () => {});
	const listSecrets = vi.fn(async () => {
		if (opts.secretNames instanceof Error) throw opts.secretNames;
		return opts.secretNames ?? SECRETS_GOOD;
	});
	const loader = makeLoader(loaded, {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		"@theholocron/holocron-plugin-github": makePlugin("gh", {
			secrets: { providerName: "github", listSecrets, setSecret, deleteSecret },
		}),
	});
	const lines: string[] = [];
	const log = fakeLogger();
	return {
		lines,
		log,
		listSecrets,
		setSecret,
		deleteSecret,
		run: () =>
			runDoctorNotifications({
				loaded,
				context: {
					repoRoot: "/tmp/test",
					...("org" in opts ? (opts.org ? { org: opts.org } : {}) : { org: "theholocron" }),
				},
				loader,
				print: (l) => lines.push(l),
				logger: log,
				...(opts.builtOnly ? { builtOnly: true } : {}),
				...(opts.deliver ? { deliver: true } : {}),
				...(opts.scope ? { scope: opts.scope } : {}),
				...(opts.fetch ? { fetch: opts.fetch } : {}),
			}),
	};
}

const byId = (r: Awaited<ReturnType<typeof runDoctorNotifications>>, id: string) => r.checks.find((c) => c.id === id)!;
const REAL = [
	"server",
	"categories",
	"channels",
	"webhooks",
	"webhook-appearance",
	"roles",
	"role-appearance",
	"access",
	"server-settings",
	"welcome-onboarding",
	"app-settings",
	"secrets",
	"role-members",
];

describe("runDoctorNotifications — a server that matches the layout", () => {
	it("passes every built check, and still fails because the unbuilt features are listed as failing", async () => {
		const { run } = setup(fakeNotifications());
		const report = await run();
		expect(REAL.map((id) => byId(report, id).status)).toEqual(REAL.map(() => "pass"));
		expect(report.summary).toEqual({ pass: 13, fail: PLANNED_CHECKS.length, skip: 1 });
		expect(report.status).toBe("fail");
		const planned = report.checks.filter((c) => c.step !== undefined);
		expect(planned.map((c) => c.id)).toEqual(PLANNED_CHECKS.map((p) => p.id));
		expect(planned[0]?.detail).toBe("not built yet (#1098, step 16)");
		expect(planned.every((c) => c.status === "fail")).toBe(true);
	});

	it("is green with --built-only, which leaves the unbuilt features out", async () => {
		const { run, lines } = setup(fakeNotifications(), { builtOnly: true });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(report.checks.map((c) => c.id)).toEqual(REAL);
		expect(lines.join("\n")).toContain("13 ok, 0 fail, 2 skipped");
		expect(lines.join("\n")).not.toContain("not built");
	});

	it("renders one line per check and ends with a count", async () => {
		const { run, lines } = setup(fakeNotifications());
		const report = await run();
		const out = lines.join("\n");
		expect(out).not.toContain("Holocron doctor notifications");
		expect(out).toContain("✓ server");
		expect(out).toContain("Holocron (as Holonet)");
		expect(out).not.toContain("Not built yet");
		expect(out).toContain("✓ webhook names and avatars set");
		expect(out).toContain("not built yet (#1098, step 16)");
		expect(out).toContain("✗ server created from config");
		expect(out).toContain("13 ok, 1 fail, 1 skipped");
		// every check has its own row, built or not
		expect(lines.filter((l) => /^ {2}[✓✗] /.test(l))).toHaveLength(report.checks.length);
	});

	it("changes nothing: no provisioning call and no secret is written", async () => {
		const n = fakeNotifications();
		const { run, setSecret, deleteSecret } = setup(n);
		await run();
		const calls = (["ensureCategory", "ensureChannel", "ensureWebhook", "ensureRole"] as const).map(
			(m) => (n[m] as ReturnType<typeof vi.fn>).mock.calls.length
		);
		expect(calls).toEqual([0, 0, 0, 0]);
		expect(setSecret).not.toHaveBeenCalled();
		expect(deleteSecret).not.toHaveBeenCalled();
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

describe("runDoctorNotifications — drift is reported with what is wrong", () => {
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

describe("runDoctorNotifications — when a step cannot run", () => {
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
		const { run, lines } = setup(n);
		const report = await run();
		expect(byId(report, "server").detail).toContain("401: Unauthorized");
		for (const id of ["categories", "channels", "webhooks", "roles"]) {
			expect(byId(report, id).status).toBe("fail");
			expect(byId(report, id).detail).toBe("not checked: could not read the server");
		}
		expect(byId(report, "secrets").status).toBe("pass");
		// Both reads fail for the same reason; it must be printed once, not once per step.
		expect(lines.join("\n").match(/401: Unauthorized/g)).toHaveLength(1);
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

	it("does not fail the server step just because the provider has no whoami, if the server can be read", async () => {
		const report = await setup(fakeNotifications({ whoami: undefined })).run();
		expect(byId(report, "server")).toMatchObject({
			status: "pass",
			detail: "readable (the provider has no whoami)",
		});
		expect(byId(report, "channels").status).toBe("pass");
	});

	it("fails the server step with the read error, once, when there is no whoami and the server cannot be read", async () => {
		const n = fakeNotifications({
			whoami: undefined,
			inspect: vi.fn(async () => {
				throw new ProviderApiError(
					"Discord GET /guilds/1/channels → 401",
					401,
					'{"message":"401: Unauthorized"}'
				);
			}),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(byId(report, "server")).toMatchObject({
			status: "fail",
			detail: expect.stringContaining("401: Unauthorized"),
		});
		expect(report.checks.some((c) => c.id === "read")).toBe(false);
		expect(lines.join("\n").match(/401: Unauthorized/g)).toHaveLength(1);
	});

	it("refuses a provider that cannot inspect a server, saying what it needs", async () => {
		const report = await setup(fakeNotifications({ inspect: undefined })).run();
		expect(report).toMatchObject({ status: "fail", message: expect.stringMatching(/can inspect a server/) });
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

describe("runDoctorNotifications — refusals", () => {
	it("refuses, and says why, when the provider declares no layout", async () => {
		const { run, lines } = setup(fakeNotifications({ layout: undefined }));
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/declares no layout/);
		expect(lines.join("\n")).toContain("✗ the `discord` provider declares no layout");
		expect(lines.at(-1)).toBe("0 ok, 1 fail, 0 skipped");
	});

	it("refuses when no notifications provider can be inspected", async () => {
		const post = { key: "notifications", providerName: "slack", send: async () => {} } as Notifications;
		expect(await setup(post).run()).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/can inspect a server/),
		});
	});
});

describe("runDoctorNotifications — output and logs", () => {
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
		await runDoctorNotifications({ loaded, context: { repoRoot: "/tmp/test" }, loader });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("server reachable"));
		log.mockRestore();
	});
});

describe("PLANNED_CHECKS", () => {
	it("numbers the steps still to build in order, matching the table in #1098, with no duplicates", () => {
		// 8 to 14 (access, role appearance, server settings, welcome and onboarding, the app, role members) are built, so they are real checks.
		expect(PLANNED_CHECKS.map((p) => p.step)).toEqual([16]);
		expect(new Set(PLANNED_CHECKS.map((p) => p.id)).size).toBe(PLANNED_CHECKS.length);
	});
});

describe("runDoctorNotifications — edge cases in what the server holds", () => {
	it("refuses when no notifications provider is configured at all", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { secrets: "github" } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: { providerName: "github", listSecrets: async () => [] },
			}),
		});
		const report = await runDoctorNotifications({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});
		expect(report).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/no `notifications` provider is available/),
		});
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

	describe("runDoctorNotifications — review fixes", () => {
		it("uses a provider that can only read, with no provisioning methods at all", async () => {
			const readOnly = {
				key: "notifications",
				providerName: "readonly",
				send: async () => {},
				layout: LAYOUT,
				whoami: async () => ({ target: "Holocron" }),
				inspect: async () => GOOD,
			} as Notifications;
			const report = await setup(readOnly, { builtOnly: true }).run();
			expect(report.status).toBe("ok");
		});

		it("says why a configured notifications plugin failed to load", async () => {
			const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
			const loader = makeLoader(loaded, {
				"@theholocron/holocron-plugin-discord": {
					createPlugin: () => {
						throw new Error("no Discord webhook URL found");
					},
				},
			});
			const report = await runDoctorNotifications({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader,
				print: () => {},
			});
			expect(report.message).toMatch(/`discord` failed to load: no Discord webhook URL found/);
		});

		it("treats an empty topic in the layout as unspecified, as setup does", async () => {
			const layout: NotificationsLayout = { categories: [{ name: "A", channels: [{ name: "dev", topic: "" }] }] };
			const found: ServerInspection = {
				categories: ["A"],
				channels: [{ name: "dev", category: "A", topic: "whatever it has", webhooks: [] }],
				roles: [],
			};
			const report = await setup(fakeNotifications({ layout, found }), { secrets: false, org: "" }).run();
			expect(byId(report, "channels").status).toBe("pass");
		});

		it("reports a channel whose webhooks could not be listed on that channel, not as a missing webhook", async () => {
			const found: ServerInspection = {
				...GOOD,
				channels: GOOD.channels.map((c) =>
					c.name === "alerts" ? { ...c, webhooks: [], webhooksError: "Discord GET → 403: Missing Access" } : c
				),
			};
			const c = byId(await setup(fakeNotifications({ found })).run(), "webhooks");
			expect(c.problems).toEqual(["#alerts: could not list its webhooks (Discord GET → 403: Missing Access)"]);
		});

		it("reports one roles problem, not one per role, when the roles could not be read", async () => {
			const found: ServerInspection = { ...GOOD, roles: [], rolesError: "Discord GET → 500" };
			const report = await setup(fakeNotifications({ found })).run();
			expect(byId(report, "roles").problems).toEqual(["could not read the roles (Discord GET → 500)"]);
			expect(byId(report, "channels").status).toBe("pass");
		});

		it("fails the secrets step for a layout whose secret names collide, as setup would refuse it", async () => {
			const layout: NotificationsLayout = {
				categories: [
					{ name: "A", channels: [{ name: "alerts", webhook: { secret: "Holocron_Notify_Alert_Role" } }] },
				],
				roles: [{ name: "gatekeepers", secret: "HOLOCRON_NOTIFY_ALERT_ROLE" }],
			};
			const found: ServerInspection = {
				categories: ["A"],
				channels: [{ name: "alerts", category: "A", webhooks: ["alerts"] }],
				roles: [{ name: "gatekeepers", id: "1", mentionable: true }],
			};
			const c = byId(
				await setup(fakeNotifications({ layout, found }), {
					secretNames: ["HOLOCRON_NOTIFY_ALERT_ROLE"],
				}).run(),
				"secrets"
			);
			expect(c.status).toBe("fail");
			expect(c.problems[0]).toMatch(
				/channel `alerts` and role `gatekeepers` would both store into HOLOCRON_NOTIFY_ALERT_ROLE/
			);
		});

		it("is still a failing report with --built-only when a real check fails", async () => {
			const report = await setup(fakeNotifications({ found: { ...GOOD, categories: ["ALERTS"] } }), {
				builtOnly: true,
			}).run();
			expect(report.status).toBe("fail");
			expect(report.summary).toEqual({ pass: 12, fail: 1, skip: PLANNED_CHECKS.length + 1 });
		});

		it("keeps control characters in an ordinary provider error off the screen", async () => {
			const n = fakeNotifications({
				whoami: vi.fn(async () => {
					throw new Error("nope\u001b[2J\nFAKE ROW");
				}),
			});
			const { run, lines } = setup(n);
			const report = await run();
			expect(byId(report, "server").detail).toBe("nope [2J FAKE ROW");
			expect(lines.join("\n").includes("\u001b")).toBe(false);
		});
	});
});

describe("runDoctorNotifications — role colour, hoist and permissions", () => {
	const STYLED: NotificationsLayout = {
		roles: [
			{
				name: "gatekeepers",
				color: "#F0B232",
				hoist: true,
				permissions: ["ViewChannel", "SendMessages"],
			},
		],
	};
	const found = (role: Partial<ServerInspection["roles"][number]>): ServerInspection => ({
		categories: [],
		channels: [],
		roles: [{ name: "gatekeepers", id: "99", mentionable: false, ...role }],
	});
	const run = (inspection: ServerInspection) =>
		setup(fakeNotifications({ layout: STYLED, found: inspection }), { secretNames: [] }).run();

	it("passes when colour, hoist and permissions all match (colour case-insensitively, permissions in any order)", async () => {
		const report = await run(
			found({ color: "#f0b232", hoist: true, permissions: ["SendMessages", "ViewChannel"] })
		);
		expect(byId(report, "role-appearance")).toMatchObject({ status: "pass", detail: "1 of 1 as declared" });
	});

	it("names each thing that is different", async () => {
		const report = await run(found({ permissions: ["ViewChannel", "ManageMessages"] }));
		const check = byId(report, "role-appearance");
		expect(check.status).toBe("fail");
		expect(check.problems).toEqual([
			"gatekeepers: colour is default but the layout says #F0B232",
			"gatekeepers: hoist is false but the layout says true",
			"gatekeepers: missing permissions SendMessages",
			"gatekeepers: has extra permissions ManageMessages",
		]);
	});

	it("says what colour and hoist it found when they are set", async () => {
		const report = await run(found({ color: "#000001", hoist: false, permissions: [] }));
		expect(byId(report, "role-appearance").problems[0]).toBe(
			"gatekeepers: colour is #000001 but the layout says #F0B232"
		);
	});

	it("fails, without calling it a pass, for a role that is missing", async () => {
		const report = await run({ categories: [], channels: [], roles: [] });
		expect(byId(report, "roles").status).toBe("fail");
		expect(byId(report, "role-appearance").status).toBe("fail");
		expect(byId(report, "role-appearance").problems).toEqual(["gatekeepers: not checked, the role is missing"]);
	});

	it("says so when the provider did not report a role's permissions, instead of calling them empty", async () => {
		const report = await run(found({ color: "#f0b232", hoist: true }));
		expect(byId(report, "role-appearance").problems).toEqual([
			"gatekeepers: the provider did not report its permissions",
		]);
	});

	it("flags two roles with the same name", async () => {
		const report = await run({
			categories: [],
			channels: [],
			roles: [
				{ name: "gatekeepers", id: "1", mentionable: false },
				{ name: "Gatekeepers", id: "2", mentionable: false },
			],
		});
		expect(byId(report, "roles").problems).toEqual([
			"gatekeepers: 2 roles have this name; setup cannot tell which to manage",
		]);
	});

	it("is not checked when the roles could not be read", async () => {
		const report = await run({ categories: [], channels: [], roles: [], rolesError: "403" });
		expect(byId(report, "role-appearance").problems).toEqual(["not checked: could not read the roles"]);
	});

	it("passes with 'none declared' when the layout states no appearance", async () => {
		const report = await setup(fakeNotifications()).run();
		expect(byId(report, "role-appearance")).toMatchObject({ status: "pass", detail: "none declared" });
	});

	it("fails with the others when the server cannot be read", async () => {
		const n = fakeNotifications({
			inspect: vi.fn(async () => {
				throw new Error("down");
			}),
		});
		const report = await setup(n).run();
		expect(byId(report, "role-appearance")).toMatchObject({
			status: "fail",
			detail: "not checked: could not read the server",
		});
	});
});

describe("runDoctorNotifications — channel and category access", () => {
	const LAYOUT_ACCESS: NotificationsLayout = {
		categories: [
			{
				name: "ALERTS",
				access: { post: [] },
				channels: [{ name: "alerts" }, { name: "talk", access: { post: "everyone" } }],
			},
			{ name: "STAFF", access: { view: ["Gatekeepers"] }, channels: [{ name: "updates" }] },
			{ name: "PLAIN", channels: [{ name: "free" }] },
		],
		roles: [{ name: "gatekeepers" }],
	};
	const OPEN = { view: "everyone", post: "everyone" } as const;
	const server = (
		over: {
			alerts?: unknown;
			talk?: unknown;
			updates?: unknown;
			staff?: unknown;
			alertsCat?: unknown;
		} = {}
	): ServerInspection =>
		({
			categories: ["ALERTS", "STAFF", "PLAIN"],
			categoryAccess: {
				ALERTS: over.alertsCat ?? { view: "everyone", post: [] },
				STAFF: over.staff ?? { view: ["gatekeepers"], post: "everyone" },
				PLAIN: OPEN,
			},
			channels: [
				{
					name: "alerts",
					category: "ALERTS",
					webhooks: [],
					access: over.alerts ?? { view: "everyone", post: [] },
				},
				{ name: "talk", category: "ALERTS", webhooks: [], access: over.talk ?? OPEN },
				{
					name: "updates",
					category: "STAFF",
					webhooks: [],
					access: over.updates ?? { view: ["gatekeepers"], post: "everyone" },
				},
				{ name: "free", category: "PLAIN", webhooks: [], access: OPEN },
			],
			roles: [{ name: "gatekeepers", id: "1", mentionable: false }],
		}) as ServerInspection;
	const run = (found: ServerInspection) =>
		setup(fakeNotifications({ layout: LAYOUT_ACCESS, found }), { secretNames: [] }).run();

	it("passes when every category and channel with an access matches it, a channel's own fields over its category's", async () => {
		const check = byId(await run(server()), "access");
		expect(check).toMatchObject({ status: "pass", detail: "5 of 5 as declared" });
	});

	it("names what differs, and says 'nobody' for an empty list", async () => {
		const report = await run(
			server({
				alerts: OPEN,
				staff: OPEN,
				updates: { view: "everyone", post: ["x"] },
				talk: { view: "everyone", post: [] },
			})
		);
		expect(byId(report, "access").problems).toEqual([
			"#alerts: post is everyone but the layout says nobody (bots and webhooks only)",
			"#talk: post is nobody (bots and webhooks only) but the layout says everyone",
			"STAFF: view is everyone but the layout says Gatekeepers",
			"#updates: view is everyone but the layout says Gatekeepers",
			"#updates: post is x but the layout says everyone",
		]);
	});

	it("compares roles without regard to case, order or repeats", async () => {
		const two: NotificationsLayout = {
			roles: [{ name: "a" }, { name: "b" }],
			categories: [{ name: "STAFF", access: { view: ["A", "b", "a"] } }],
		};
		const found = (view: string[]): ServerInspection => ({
			categories: ["STAFF"],
			categoryAccess: { STAFF: { view, post: "everyone" } },
			channels: [],
			roles: [],
		});
		const check = (view: string[]) =>
			setup(fakeNotifications({ layout: two, found: found(view) }), { secretNames: [] }).run();
		expect(byId(await check(["b", "a"]), "access").status).toBe("pass");
		expect(byId(await check(["a", "a", "B"]), "access").status).toBe("pass");
		expect(byId(await check(["a"]), "access").status).toBe("fail");
	});

	it("does not mistake one role whose name contains a comma for two roles", async () => {
		const layout: NotificationsLayout = {
			roles: [{ name: "a" }],
			categories: [{ name: "STAFF", access: { view: ["a,b"] } }],
		};
		const found: ServerInspection = {
			categories: ["STAFF"],
			categoryAccess: { STAFF: { view: ["a", "b"], post: "everyone" } },
			channels: [],
			roles: [],
		};
		const report = await setup(fakeNotifications({ layout, found }), { secretNames: [] }).run();
		expect(byId(report, "access").status).toBe("fail");
	});

	it("says overwrites it cannot express are not an access the layout can state", async () => {
		const found = server({ alerts: "custom", staff: "custom" });
		const report = await run(found);
		expect(byId(report, "access").problems).toEqual([
			"#alerts: has permission overwrites that are not an access the layout can state; re-run setup to replace them",
			"STAFF: has permission overwrites that are not an access the layout can state; re-run setup to replace them",
		]);
	});

	it("is not checked, not compared against raw ids, when the roles could not be read", async () => {
		const found = { ...server(), rolesError: "403" };
		const report = await run(found);
		expect(byId(report, "access").problems).toEqual(["not checked: could not read the roles"]);
	});

	it("says so when a channel or category is missing, and when the provider reports no access", async () => {
		const noAccess = server();
		noAccess.channels = noAccess.channels.map((c) => (c.name === "alerts" ? { ...c, access: undefined } : c));
		delete noAccess.categoryAccess!.STAFF;
		const report = await run(noAccess);
		expect(byId(report, "access").problems).toEqual([
			"#alerts: the provider did not report its access",
			"STAFF: the provider did not report its access",
		]);
		const missing = await run({ ...server(), categories: ["ALERTS", "PLAIN"], channels: [] });
		expect(byId(missing, "access").problems).toEqual([
			"#alerts: not checked, the channel is missing",
			"#talk: not checked, the channel is missing",
			"STAFF: not checked, the category is missing",
			"#updates: not checked, the channel is missing",
		]);
	});

	it("says the provider did not report a category's access when it reports none at all", async () => {
		const noCategoryAccess = server();
		delete noCategoryAccess.categoryAccess;
		const report = await run(noCategoryAccess);
		expect(byId(report, "access").problems).toEqual([
			"ALERTS: the provider did not report its access",
			"STAFF: the provider did not report its access",
		]);
	});

	it("reports 'none declared' for a layout with no access", async () => {
		expect(byId(await setup(fakeNotifications()).run(), "access")).toMatchObject({
			status: "pass",
			detail: "none declared",
		});
	});

	it("is not checked when the server could not be read", async () => {
		const n = fakeNotifications({
			inspect: vi.fn(async () => {
				throw new Error("down");
			}),
		});
		expect(byId(await setup(n).run(), "access")).toMatchObject({
			status: "fail",
			detail: "not checked: could not read the server",
		});
	});
});

describe("runDoctorNotifications — server settings", () => {
	const SERVER: NotificationsLayout = {
		categories: [{ name: "A", channels: [{ name: "welcome" }] }],
		server: {
			verification: "medium",
			defaultNotifications: "mentions",
			contentFilter: "all",
			systemChannel: "Welcome",
			community: true,
			locale: "en-US",
		},
	};
	const found = (server: ServerInspection["server"], extra: Partial<ServerInspection> = {}): ServerInspection => ({
		categories: ["A"],
		channels: [{ name: "welcome", category: "A", webhooks: [] }],
		roles: [],
		...(server ? { server } : {}),
		...extra,
	});
	const GOOD_SERVER = {
		verification: "medium",
		defaultNotifications: "mentions",
		contentFilter: "all",
		systemChannel: "welcome",
		community: true,
		locale: "en-US",
	} as const;
	const run = (inspection: ServerInspection) =>
		setup(fakeNotifications({ layout: SERVER, found: inspection }), { secretNames: [] }).run();

	it("passes when every field the layout states matches, channel names ignoring case", async () => {
		expect(byId(await run(found({ ...GOOD_SERVER })), "server-settings")).toMatchObject({
			status: "pass",
			detail: "6 of 6 as declared",
		});
	});

	it("names each field that differs, and says 'not set' for one the server lacks", async () => {
		const report = await run(
			found({ verification: "low", contentFilter: "off", community: false, locale: "en-US" })
		);
		expect(byId(report, "server-settings").problems).toEqual([
			"verification is low but the layout says medium",
			"defaultNotifications is not set but the layout says mentions",
			"contentFilter is off but the layout says all",
			"systemChannel is not set but the layout says Welcome",
			"community is false but the layout says true",
		]);
	});

	it("compares a description exactly, but a channel name without regard to case", async () => {
		const layout: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "Welcome" }] }],
			server: { systemChannel: "Welcome", description: "Hello There" },
		};
		const report = await setup(
			fakeNotifications({
				layout,
				found: found({ systemChannel: "welcome", description: "hello there" }),
			}),
			{ secretNames: [] }
		).run();
		expect(byId(report, "server-settings").problems).toEqual([
			"description is hello there but the layout says Hello There",
		]);
	});

	it("is not checked when the settings could not be read, or the provider reports none", async () => {
		const unread = await run(found(undefined, { serverError: "403" }));
		expect(byId(unread, "server-settings").problems).toEqual([
			"not checked: could not read the server settings (403)",
		]);
		const none = await run(found(undefined));
		expect(byId(none, "server-settings").problems).toEqual(["the provider did not report the server's settings"]);
	});

	it("compares description and the other channels too, and reports 'none declared' without a server section", async () => {
		const layout: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "rules" }] }],
			server: { rulesChannel: "rules", updatesChannel: "updates", description: "Hello" },
		};
		const report = await setup(
			fakeNotifications({
				layout,
				found: found({ rulesChannel: "rules", updatesChannel: "other", description: "Bye" }),
			}),
			{ secretNames: [] }
		).run();
		expect(byId(report, "server-settings").problems).toEqual([
			"updatesChannel is other but the layout says updates",
			"description is Bye but the layout says Hello",
		]);
		expect(byId(await setup(fakeNotifications()).run(), "server-settings")).toMatchObject({
			status: "pass",
			detail: "none declared",
		});
	});
});

describe("runDoctorNotifications — welcome screen and onboarding", () => {
	const LAYOUT_WO: NotificationsLayout = {
		categories: [{ name: "A", channels: [{ name: "rules" }, { name: "dev" }] }],
		welcome: {
			description: "Hello",
			channels: [
				{ channel: "rules", description: "Be kind", emoji: "📜" },
				{ channel: "dev", description: "Build" },
			],
		},
		onboarding: {
			defaultChannels: ["rules", "dev"],
			prompts: [
				{
					title: "What brings you here?",
					options: [
						{ title: "Building", channels: ["dev"] },
						{ title: "Reading", description: "Just reading", channels: ["rules"], roles: ["Readers"] },
					],
				},
			],
		},
	};
	const HAVE: Pick<ServerInspection, "welcome" | "onboarding"> = {
		welcome: {
			enabled: true,
			description: "Hello",
			channels: [
				{ channel: "Rules", description: "Be kind", emoji: "📜" },
				{ channel: "dev", description: "Build" },
			],
		},
		onboarding: {
			enabled: false,
			defaultChannels: ["dev", "rules"],
			prompts: [
				{
					title: "What brings you here?",
					singleSelect: false,
					required: false,
					options: [
						{ title: "Building", channels: ["dev"], roles: [] },
						{ title: "Reading", description: "Just reading", channels: ["RULES"], roles: ["readers"] },
					],
				},
			],
		},
	};
	const found = (over: Partial<ServerInspection> = {}): ServerInspection => ({
		categories: [],
		channels: [],
		roles: [],
		...HAVE,
		...over,
	});
	const run = (inspection: ServerInspection, layout = LAYOUT_WO) =>
		setup(fakeNotifications({ layout, found: inspection }), { secretNames: [] }).run();
	const check = (report: Awaited<ReturnType<typeof run>>) => byId(report, "welcome-onboarding");

	it("passes when both match, ignoring case, order of channels and of answers", async () => {
		expect(check(await run(found()))).toMatchObject({ status: "pass", detail: "2 of 2 as declared" });
	});

	it("names what differs on the welcome screen", async () => {
		const report = await run(
			found({
				welcome: {
					enabled: false,
					description: "Other",
					channels: [{ channel: "dev", description: "Build" }],
				},
			})
		);
		expect(check(report).problems).toEqual([
			"welcome screen is off but the layout says on",
			'welcome description is "Other" but the layout says "Hello"',
			"welcome channels are dev but the layout says rules, dev (or their descriptions or emoji differ)",
		]);
	});

	it("says 'none' when the server's welcome screen points nowhere", async () => {
		const report = await run(found({ welcome: { enabled: true, description: "Hello", channels: [] } }));
		expect(check(report).problems[0]).toMatch(/welcome channels are none but the layout says/);
	});

	it("names what differs in onboarding: switch, default channels and questions", async () => {
		const wanted: NotificationsLayout = {
			...LAYOUT_WO,
			onboarding: { ...LAYOUT_WO.onboarding!, enabled: true },
		};
		const report = await run(
			found({
				onboarding: {
					enabled: false,
					defaultChannels: ["dev"],
					prompts: [
						{ title: "What brings you here?", options: [{ title: "Building", channels: ["rules"] }] },
						{ title: "Extra question", options: [] },
					],
				},
			}),
			wanted
		);
		expect(check(report).problems).toEqual([
			"onboarding is off but the layout says on",
			"default channels are dev but the layout says rules, dev",
			'question "What brings you here?" differs from the layout',
			'question "Extra question" is not in the layout',
		]);
	});

	it("reports questions that are on the server in a different order from the layout", async () => {
		const q = (title: string) => ({ title, options: [] });
		const wanted: NotificationsLayout = {
			...LAYOUT_WO,
			onboarding: { prompts: [q("First"), q("Second")] },
		};
		const report = await run(
			found({ onboarding: { enabled: false, defaultChannels: [], prompts: [q("Second"), q("First")] } }),
			wanted
		);
		expect(check(report).problems).toEqual(["the questions are in a different order from the layout"]);
	});

	it("says a layout question missing on the server is missing, and 'none' for no default channels", async () => {
		const report = await run(found({ onboarding: { enabled: false, defaultChannels: [], prompts: [] } }));
		expect(check(report).problems).toEqual([
			"default channels are none but the layout says rules, dev",
			'question "What brings you here?" is missing',
		]);
	});

	it("leaves out what the layout does not state, and treats a missing list on the server as empty", async () => {
		const layout: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "dev" }] }],
			onboarding: { defaultChannels: ["dev"], prompts: [] },
		};
		const none = await run(found({ onboarding: { enabled: true } }), layout);
		expect(check(none).problems).toEqual(["default channels are none but the layout says dev"]);
		const bare: NotificationsLayout = { onboarding: {} };
		expect(check(await run(found({ onboarding: { enabled: true } }), bare)).status).toBe("pass");
	});

	it("reads the options of a prompt that states none as empty", async () => {
		const layout: NotificationsLayout = {
			categories: [],
			onboarding: { prompts: [{ title: "Q", options: [] }] },
		};
		const report = await run(found({ onboarding: { prompts: [{ title: "Q" } as never] } }), layout);
		expect(check(report).status).toBe("pass");
	});

	it("names the switches the other way round too, and an empty or missing list of default channels", async () => {
		const layout: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "dev" }] }],
			welcome: { enabled: false, description: "Hello", channels: [] },
			onboarding: { enabled: false, defaultChannels: [] },
		};
		const on = await run(
			found({
				welcome: { enabled: true, description: "Hello", channels: [] },
				onboarding: { enabled: true, defaultChannels: ["dev"] },
			}),
			layout
		);
		expect(check(on).problems).toEqual([
			"welcome screen is on but the layout says off",
			"onboarding is on but the layout says off",
			"default channels are dev but the layout says none",
		]);
		const missing = await run(found({ onboarding: { enabled: false } }), {
			...layout,
			welcome: undefined,
			onboarding: { defaultChannels: ["dev"] },
		});
		expect(check(missing).problems).toEqual(["default channels are none but the layout says dev"]);
	});

	it("compares questions whose answers state no channels or roles", async () => {
		const layout: NotificationsLayout = {
			categories: [],
			onboarding: { prompts: [{ title: "Q", options: [{ title: "A" }] }] },
		};
		const bare = found({ onboarding: { prompts: [{ title: "Q", options: [{ title: "A" }] }] } });
		expect(check(await run(bare, layout)).status).toBe("pass");
	});

	it("is not checked when either could not be read, or the provider reports neither", async () => {
		const errors = await run(
			found({ welcome: undefined, onboarding: undefined, welcomeError: "403", onboardingError: "500" })
		);
		expect(check(errors).problems).toEqual([
			"not checked: could not read the welcome screen (403)",
			"not checked: could not read onboarding (500)",
		]);
		const none = await run(found({ welcome: undefined, onboarding: undefined }));
		expect(check(none).problems).toEqual([
			"the provider did not report the welcome screen",
			"the provider did not report onboarding",
		]);
	});

	it("reports 'none declared' without either section", async () => {
		expect(check(await setup(fakeNotifications()).run())).toMatchObject({
			status: "pass",
			detail: "none declared",
		});
	});
});

describe("runDoctorNotifications — webhook avatars", () => {
	const withAvatar: NotificationsLayout = { ...LAYOUT, webhookAvatar: "media/a.png" };
	const check = (report: { checks: Array<{ id: string; problems: string[]; detail: string }> }) =>
		report.checks.find((c) => c.id === "webhook-appearance")!;
	const channelsWith = (webhookAvatars?: string[]): ServerInspection => ({
		...GOOD,
		channels: GOOD.channels.map((c) =>
			c.webhooks.length > 0 ? { ...c, ...(webhookAvatars ? { webhookAvatars } : {}) } : c
		),
	});

	it("says none declared when no webhook has an avatar to set", async () => {
		const report = await setup(fakeNotifications()).run();
		expect(check(report)).toMatchObject({ detail: "none declared", problems: [] });
	});

	it("passes when every webhook that should have one has it", async () => {
		const report = await setup(
			fakeNotifications({ layout: withAvatar, found: channelsWith(["alerts", "sync"]) })
		).run();
		expect(check(report)).toMatchObject({ detail: "2 of 2 set", problems: [] });
	});

	it("names a webhook with no avatar, and skips a provider that does not report them", async () => {
		const some = await setup(fakeNotifications({ layout: withAvatar, found: channelsWith(["alerts"]) })).run();
		expect(check(some).problems).toEqual(["#sync: webhook sync has no avatar"]);
		const unknown = await setup(fakeNotifications({ layout: withAvatar, found: channelsWith() })).run();
		expect(check(unknown).problems).toEqual([]);
	});

	it("uses a webhook's own avatar, and skips one that has none anywhere", async () => {
		const own: NotificationsLayout = {
			...LAYOUT,
			categories: [
				{
					name: "ALERTS",
					channels: [{ name: "alerts", webhook: { avatar: "x.png" } }, { name: "errors" }],
				},
				{ name: "AUTOMATION", channels: [{ name: "sync", webhook: true }] },
			],
		};
		const report = await setup(fakeNotifications({ layout: own, found: channelsWith(["alerts"]) })).run();
		expect(check(report)).toMatchObject({ detail: "1 of 1 set", problems: [] });
	});

	it("reports a channel that is missing, and one whose webhooks could not be listed", async () => {
		const found: ServerInspection = {
			...GOOD,
			channels: [
				{ name: "alerts", category: "ALERTS", webhooks: [], webhooksError: "boom" },
				{ name: "errors", category: "ALERTS", webhooks: [] },
			],
		};
		const report = await setup(fakeNotifications({ layout: withAvatar, found })).run();
		expect(check(report).problems).toEqual([
			"#alerts: could not list its webhooks (boom)",
			"#sync: no channel to hold the webhook",
		]);
	});
});

describe("runDoctorNotifications — delivery check", () => {
	const TITLE = "test message delivered through every webhook";

	it("posts nothing unless asked, and says how to ask", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, { builtOnly: true });
		const report = await run();
		expect(n.checkDelivery).not.toHaveBeenCalled();
		expect(report.checks.find((c) => c.title === TITLE)).toBeUndefined();
		expect(lines.join("\n")).toContain("add --deliver");
		expect(report.summary.skip).toBe(2); // step 16 is not built; the delivery check was not asked for
	});

	it("checks every channel that has a webhook when asked", async () => {
		const n = fakeNotifications();
		const report = await setup(n, { builtOnly: true, deliver: true }).run();
		expect(byId(report, "post-works")).toMatchObject({ status: "pass", detail: "2 of 2 delivered" });
		expect(n.checkDelivery).toHaveBeenCalledTimes(2);
		expect(n.checkDelivery).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "alerts", name: "alerts", category: "ALERTS" })
		);
	});

	it("names the channel and the step that failed", async () => {
		const checkDelivery = vi
			.fn()
			.mockResolvedValueOnce({ posted: true, readBack: true, removed: true, problems: [] })
			.mockResolvedValueOnce({
				posted: true,
				readBack: false,
				removed: true,
				problems: ["the post was accepted but is not in the channel"],
			});
		const report = await setup(fakeNotifications({ checkDelivery }), { builtOnly: true, deliver: true }).run();
		const step = byId(report, "post-works");
		expect(step.status).toBe("fail");
		expect(step.problems).toEqual(["#sync: the post was accepted but is not in the channel"]);
	});

	it("fails a check that came back incomplete without saying why", async () => {
		const checkDelivery = vi.fn(async () => ({ posted: true, readBack: false, removed: true, problems: [] }));
		const report = await setup(fakeNotifications({ checkDelivery }), { builtOnly: true, deliver: true }).run();
		expect(byId(report, "post-works").problems[0]).toContain("did not complete");
	});

	it("fails when the provider cannot check delivery, and passes when no channel has a webhook", async () => {
		const none = fakeNotifications({ checkDelivery: undefined });
		const report = await setup(none, { builtOnly: true, deliver: true }).run();
		expect(byId(report, "post-works").detail).toContain("cannot check delivery");
		const noHooks = fakeNotifications({ layout: { categories: [{ name: "A", channels: [{ name: "x" }] }] } });
		const empty = await setup(noHooks, { builtOnly: true, deliver: true }).run();
		expect(byId(empty, "post-works")).toMatchObject({ status: "pass", detail: "none declared" });
	});
});

describe("runDoctorNotifications — role members, bad declarations", () => {
	it("fails a role that declares an empty team, instead of calling it undeclared", async () => {
		const layout: NotificationsLayout = { ...LAYOUT, roles: [{ name: "gatekeepers", team: "" }] };
		const report = await setup(fakeNotifications({ layout })).run();
		const step = report.checks.find((c) => c.id === "role-members")!;
		expect(step.status).toBe("fail");
		expect(step.detail).toContain("empty");
	});
});

describe("runDoctorNotifications — bot application", () => {
	const app = {
		description: "Posts things",
		tags: ["automation", "github"],
		install: { scopes: ["bot"], permissions: ["ManageRoles", "ViewChannel"] },
		termsUrl: "https://x.test/terms",
		privacyUrl: "https://x.test/privacy",
		roleConnectionsUrl: "https://x.test/roles",
	};
	const withApp = (over: Record<string, unknown> = {}): NotificationsLayout => ({
		...LAYOUT,
		application: { ...app, ...over },
	});
	const check = (report: { checks: Array<{ id: string; problems: string[]; detail: string }> }) =>
		report.checks.find((c) => c.id === "app-settings")!;
	const same = {
		...GOOD,
		application: {
			...app,
			tags: ["GitHub", "automation"],
			install: { scopes: ["bot"], permissions: ["viewchannel", "ManageRoles"] },
		},
	};

	it("checks the Server Members Intent when the layout declares it", async () => {
		const on = { ...same, application: { ...same.application, intents: { members: true } } };
		const off = { ...same, application: { ...same.application, intents: { members: false } } };
		const layout = withApp({ intents: { members: true } });
		expect(check(await setup(fakeNotifications({ layout, found: on })).run()).problems).toEqual([]);
		expect(check(await setup(fakeNotifications({ layout, found: off })).run()).problems).toEqual([
			"the Server Members Intent is off but the layout says on (`holocron notifications setup` changes it)",
		]);
		const missing = { ...same, application: { ...same.application, intents: undefined } };
		expect(
			check(await setup(fakeNotifications({ layout, found: missing as typeof same })).run()).problems[0]
		).toContain("is off but");
		const wantOff = withApp({ intents: { members: false } });
		expect(check(await setup(fakeNotifications({ layout: wantOff, found: on })).run()).problems[0]).toContain(
			"is on but the layout says off"
		);
	});

	it("checks the redirect URIs the layout names, saying what to add and where", async () => {
		const layout = withApp({ redirectUris: ["http://localhost:53682/callback"] });
		const none = { ...same, application: { ...same.application, redirectUris: [] } };
		const has = {
			...same,
			application: { ...same.application, redirectUris: ["http://localhost:53682/callback"] },
		};
		expect(check(await setup(fakeNotifications({ layout, found: has })).run()).problems).toEqual([]);
		const problems = check(await setup(fakeNotifications({ layout, found: none })).run()).problems;
		expect(problems[0]).toContain("add http://localhost:53682/callback under OAuth2 → Redirects");
		const unreported = { ...same, application: { ...same.application, redirectUris: undefined } };
		expect(
			check(await setup(fakeNotifications({ layout, found: unreported as typeof same })).run()).problems
		).toHaveLength(1);
	});

	it("when roles follow a team, expects the redirect the link flow would use now: local while Sentinel is down", async () => {
		const down = (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch;
		const layout: NotificationsLayout = {
			...withApp(),
			roles: [{ name: "gatekeepers", team: "gatekeepers" }],
			links: { hostedUrl: "https://sentinel.example", localPort: 4000 },
		};
		const none = { ...same, application: { ...same.application, redirectUris: [] } };
		const report = await setup(fakeNotifications({ layout, found: none }), { fetch: down }).run();
		expect(check(report).problems[0]).toContain("add http://localhost:4000/callback");
		const up = (async () => Response.json({ service: "link" })) as unknown as typeof fetch;
		const hosted = await setup(fakeNotifications({ layout, found: none }), { fetch: up }).run();
		expect(check(hosted).problems[0]).toContain("add https://sentinel.example/api/link/callback");
		const registered = {
			...same,
			application: { ...same.application, redirectUris: ["https://sentinel.example/api/link/callback"] },
		};
		expect(
			check(await setup(fakeNotifications({ layout, found: registered }), { fetch: up }).run()).problems
		).toEqual([]);
	});

	it("expects the default local redirect when roles follow a team and no hosted service or port is declared", async () => {
		const layout: NotificationsLayout = { ...withApp(), roles: [{ name: "gatekeepers", team: "gatekeepers" }] };
		const none = { ...same, application: { ...same.application, redirectUris: [] } };
		expect(check(await setup(fakeNotifications({ layout, found: none })).run()).problems[0]).toContain(
			"add http://localhost:53682/callback"
		);
		const ported = { ...layout, links: { localPort: 4001 } };
		expect(check(await setup(fakeNotifications({ layout: ported, found: none })).run()).problems[0]).toContain(
			"add http://localhost:4001/callback"
		);
	});

	it("says none when the layout declares an empty tag list but the app has tags", async () => {
		const report = await setup(fakeNotifications({ layout: withApp({ tags: [] }), found: same })).run();
		expect(check(report).problems.join(" ")).toContain("but the layout says none");
	});

	it("needs no redirect when the layout declares no roles at all", async () => {
		const { roles: _roles, ...noRoles } = withApp();
		const none = { ...same, application: { ...same.application, redirectUris: [] } };
		const report = await setup(fakeNotifications({ layout: noRoles as NotificationsLayout, found: none })).run();
		expect(check(report).problems.join(" ")).not.toContain("Redirects");
	});

	it("treats a missing description as empty when the layout declares one", async () => {
		const found = { ...same, application: { ...same.application, description: undefined } };
		const report = await setup(
			fakeNotifications({ layout: withApp(), found: found as unknown as typeof same })
		).run();
		expect(check(report).problems).toContain("description differs from the layout");
	});

	it("says none declared when the layout has no application section", async () => {
		expect(check(await setup(fakeNotifications()).run())).toMatchObject({ detail: "none declared", problems: [] });
	});

	it("passes when everything matches, ignoring the order and case of tags and permissions", async () => {
		const report = await setup(fakeNotifications({ layout: withApp(), found: same })).run();
		expect(check(report)).toMatchObject({ detail: "1 of 1 as declared", problems: [] });
	});

	it("names each field that differs", async () => {
		const found = {
			...GOOD,
			application: {
				description: "Other",
				tags: ["x"],
				install: { scopes: ["bot", "applications.commands"], permissions: ["ManageRoles"] },
				privacyUrl: "https://x.test/privacy",
			},
		};
		const report = await setup(fakeNotifications({ layout: withApp(), found })).run();
		expect(check(report).problems).toEqual([
			"description differs from the layout",
			"tags are x but the layout says automation, github",
			"install scopes are bot, applications.commands but the layout says bot",
			"install permissions differ from the layout",
			"terms URL is not set but the layout says https://x.test/terms",
			"role-connections URL is not set but the layout says https://x.test/roles",
		]);
	});

	it("tells tags apart by their items, not by how they read joined, and scopes by their exact case", async () => {
		const found = {
			...GOOD,
			application: { ...app, tags: ["a,b"], install: { scopes: ["BOT"], permissions: app.install.permissions } },
		};
		const report = await setup(fakeNotifications({ layout: withApp({ tags: ["a", "b"] }), found })).run();
		expect(check(report).problems).toEqual([
			"tags are a,b but the layout says a, b",
			"install scopes are BOT but the layout says bot",
		]);
	});

	it("does not flag a field the layout leaves out, even when the application has a value for it", async () => {
		const report = await setup(
			fakeNotifications({
				layout: { ...LAYOUT, application: { tags: ["a"] } },
				found: { ...GOOD, application: { ...app, tags: ["a"], description: "something else entirely" } },
			})
		).run();
		expect(check(report).problems).toEqual([]);
	});

	it("says none for tags that are missing, and that no install link is set", async () => {
		const found = { ...GOOD, application: { description: "Posts things" } };
		const report = await setup(fakeNotifications({ layout: withApp(), found })).run();
		expect(check(report).problems.slice(0, 2)).toEqual([
			"tags are none but the layout says automation, github",
			"no install link is set",
		]);
		const noDescription = await setup(
			fakeNotifications({
				layout: withApp(),
				found: { ...GOOD, application: { ...app, description: undefined } },
			})
		).run();
		expect(check(noDescription).problems).toEqual(["description differs from the layout"]);
	});

	it("says when it could not be read or the provider did not report it", async () => {
		const failed = await setup(
			fakeNotifications({ layout: withApp(), found: { ...GOOD, applicationError: "boom" } })
		).run();
		expect(check(failed).problems).toEqual(["not checked: could not read the application (boom)"]);
		const silent = await setup(fakeNotifications({ layout: withApp() })).run();
		expect(check(silent).problems).toEqual(["the provider did not report the application"]);
	});

	it("leaves a field the layout does not state out of the comparison", async () => {
		const report = await setup(
			fakeNotifications({
				layout: { ...LAYOUT, application: { tags: ["a"] } },
				found: { ...GOOD, application: { tags: ["a"] } },
			})
		).run();
		expect(check(report).problems).toEqual([]);
	});
});

describe("runDoctorNotifications — @everyone permissions", () => {
	const layout: NotificationsLayout = { ...LAYOUT, everyone: { allow: ["ViewChannel"], deny: ["MentionEveryone"] } };
	const check = (report: { checks: Array<{ id: string; problems: string[]; detail: string }> }) =>
		report.checks.find((c) => c.id === "role-appearance")!;

	it("passes when the denied bit is off and the allowed one is on", async () => {
		const found = { ...GOOD, everyone: { permissions: ["viewchannel", "SendMessages"] } };
		expect(check(await setup(fakeNotifications({ layout, found })).run()).problems).toEqual([]);
	});

	it("names what is missing and what is still there", async () => {
		const found = { ...GOOD, everyone: { permissions: ["MentionEveryone"] } };
		expect(check(await setup(fakeNotifications({ layout, found })).run()).problems).toEqual([
			"@everyone: missing permissions ViewChannel",
			"@everyone: still has permissions the layout takes away: MentionEveryone",
		]);
	});

	it("still reports @everyone when the roles could not be read", async () => {
		const withRoles = { ...layout, roles: [{ name: "gatekeepers", mentionable: true }] };
		const found = { ...GOOD, rolesError: "boom", everyone: { permissions: ["MentionEveryone"] } };
		expect(check(await setup(fakeNotifications({ layout: withRoles, found })).run()).problems).toEqual([
			"not checked: could not read the roles",
			"@everyone: missing permissions ViewChannel",
			"@everyone: still has permissions the layout takes away: MentionEveryone",
		]);
	});

	it("allows a layout that only denies, or only allows", async () => {
		const onlyDeny = { ...LAYOUT, everyone: { deny: ["MentionEveryone"] } };
		const found = { ...GOOD, everyone: { permissions: [] } };
		expect(check(await setup(fakeNotifications({ layout: onlyDeny, found })).run()).problems).toEqual([]);
		const onlyAllow = { ...LAYOUT, everyone: { allow: ["ViewChannel"] } };
		expect(
			check(
				await setup(
					fakeNotifications({
						layout: onlyAllow,
						found: { ...GOOD, everyone: { permissions: ["ViewChannel"] } },
					})
				).run()
			).problems
		).toEqual([]);
	});

	it("says when it could not be read or the provider did not report it", async () => {
		const failed = await setup(fakeNotifications({ layout, found: { ...GOOD, everyoneError: "boom" } })).run();
		expect(check(failed).problems).toEqual(["@everyone: not checked, could not read its permissions (boom)"]);
		const silent = await setup(fakeNotifications({ layout })).run();
		expect(check(silent).problems).toEqual(["@everyone: the provider did not report its permissions"]);
	});
});

describe("runDoctorNotifications — role-members (step 14)", () => {
	const TEAM_LAYOUT: NotificationsLayout = {
		...LAYOUT,
		roles: [{ name: "gatekeepers", mentionable: true, secret: "HOLOCRON_NOTIFY_ALERT_ROLE", team: "gatekeepers" }],
	};
	const LINKS = JSON.stringify({
		version: 1,
		links: [
			{ github: "1", login: "luke", member: "333" },
			{ github: "2", login: "leia", member: "444" },
		],
	});

	function run(
		over: Partial<Notifications>,
		source: Record<string, unknown> | undefined,
		secretsOnly = false,
		org: string | undefined = "theholocron"
	): Promise<Awaited<ReturnType<typeof runDoctorNotifications>>> {
		const loaded = loadedFrom({
			name: "demo",
			providers: { notifications: ["discord"], secrets: "github", ...(source ? { source: "github" } : {}) },
		});
		const notifications = fakeNotifications({ layout: TEAM_LAYOUT, ...over });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: { providerName: "github", listSecrets: async () => SECRETS_GOOD },
				...(source && !secretsOnly ? { source } : {}),
			}),
		});
		return runDoctorNotifications({
			loaded,
			context: { repoRoot: "/tmp/test", ...(org ? { org } : {}) },
			loader,
			print: () => {},
			logger: fakeLogger(),
			builtOnly: true,
		});
	}

	const src = (over: Record<string, unknown> = {}) => ({
		providerName: "github",
		teamMembers: async () => [{ id: "1", login: "luke" }],
		readFile: async () => ({ content: LINKS, version: "v" }),
		...over,
	});

	it("works without an org when the layout names the links repo", async () => {
		const layout = { ...TEAM_LAYOUT, links: { repo: "me/links" } };
		const report = await run({ layout, roleMembers: async () => [{ id: "333" }] }, src(), false, "");
		expect(byId(report, "role-members")).toMatchObject({ status: "pass" });
	});

	it("passes when the holders are exactly the linked team members", async () => {
		const report = await run({ roleMembers: async () => [{ id: "333" }] }, src());
		expect(byId(report, "role-members")).toMatchObject({ status: "pass", detail: "1 of 1 in sync" });
	});

	it("names who lacks the role, who should lose it, and who has not linked", async () => {
		const report = await run(
			{ roleMembers: async () => [{ id: "444" }] },
			src({
				teamMembers: async () => [
					{ id: "1", login: "luke" },
					{ id: "7", login: "newbie" },
				],
			})
		);
		const check = byId(report, "role-members");
		expect(check.status).toBe("fail");
		expect(check.problems).toEqual([
			"luke: on team gatekeepers but lacks gatekeepers",
			"leia: holds gatekeepers but left team gatekeepers",
			"newbie: on team gatekeepers but has not linked their account",
		]);
	});

	it("passes as none declared when no role follows a team", async () => {
		const report = await run({ layout: LAYOUT }, src());
		expect(byId(report, "role-members")).toMatchObject({ status: "pass", detail: "none declared" });
	});

	it("fails with the reason when the provider cannot list holders, or there is no usable source", async () => {
		expect(byId(await run({ roleMembers: undefined }, src()), "role-members").detail).toContain(
			"cannot list who holds"
		);
		expect(byId(await run({ roleMembers: async () => [] }, undefined), "role-members").detail).toContain(
			"`source`"
		);
		expect(
			byId(await run({ roleMembers: async () => [] }, src({ teamMembers: undefined })), "role-members").detail
		).toContain("cannot list team members");
	});

	it("fails with the reason when reading the links or the holders fails", async () => {
		const badLinks = await run(
			{ roleMembers: async () => [] },
			src({ readFile: async () => ({ content: "{x", version: "v" }) })
		);
		expect(byId(badLinks, "role-members").detail).toContain("not valid JSON");
		const denied = await run(
			{
				roleMembers: async () => {
					throw new Error("intent off");
				},
			},
			src()
		);
		expect(byId(denied, "role-members").detail).toContain("intent off");
	});
});
