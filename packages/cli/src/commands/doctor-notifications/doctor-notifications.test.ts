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
				...(opts.scope ? { scope: opts.scope } : {}),
			}),
	};
}

const byId = (r: Awaited<ReturnType<typeof runDoctorNotifications>>, id: string) => r.checks.find((c) => c.id === id)!;
const REAL = ["server", "categories", "channels", "webhooks", "roles", "role-appearance", "access", "secrets"];

describe("runDoctorNotifications — a server that matches the layout", () => {
	it("passes every built check, and still fails because the unbuilt features are listed as failing", async () => {
		const { run } = setup(fakeNotifications());
		const report = await run();
		expect(REAL.map((id) => byId(report, id).status)).toEqual(REAL.map(() => "pass"));
		expect(report.summary).toEqual({ pass: 8, fail: PLANNED_CHECKS.length, skip: 0 });
		expect(report.status).toBe("fail");
		const planned = report.checks.filter((c) => c.step !== undefined);
		expect(planned.map((c) => c.id)).toEqual(PLANNED_CHECKS.map((p) => p.id));
		expect(planned[0]?.detail).toBe("not built yet (#1098, step 10)");
		expect(planned.every((c) => c.status === "fail")).toBe(true);
	});

	it("is green with --built-only, which leaves the unbuilt features out", async () => {
		const { run, lines } = setup(fakeNotifications(), { builtOnly: true });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(report.checks.map((c) => c.id)).toEqual(REAL);
		expect(lines.join("\n")).toContain("8 ok, 0 fail, 7 skipped");
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
		expect(out).toContain("✗ server verification, notifications and system channels set");
		expect(out).toContain("not built yet (#1098, step 10)");
		expect(out).toContain("✗ server created from config");
		expect(out).toContain("8 ok, 7 fail, 0 skipped");
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
		// 8 (access) and 9 (role colour, hoist and permissions) are built, so they are real checks and not listed here.
		expect(PLANNED_CHECKS.map((p) => p.step)).toEqual([10, 11, 12, 13, 14, 15, 16]);
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
			expect(report.summary).toEqual({ pass: 7, fail: 1, skip: PLANNED_CHECKS.length });
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
