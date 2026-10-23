import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { PREFLIGHT_PREFIX } from "../notifications-channel-add/index.js";
import { runNotificationsSetup } from "./notifications-setup.js";

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
		{ name: "EMPTY" },
	],
	roles: [{ name: "gatekeepers", mentionable: true }, { name: "plain" }],
};

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		ensureCategory: vi.fn(async () => ({ id: "c", created: true })),
		ensureChannel: vi.fn(async () => ({ id: "1", created: true })),
		ensureWebhook: vi.fn(async () => ({ created: true, url: "https://hook/x" })),
		ensureRole: vi.fn(async () => ({ id: "99", created: true })),
		...over,
	} as Notifications;
}

function setup(notifications: Notifications, opts: { secrets?: boolean; dryRun?: boolean; org?: string } = {}) {
	const loaded = loadedFrom({
		name: "demo",
		providers: { notifications: ["discord"], ...(opts.secrets === false ? {} : { secrets: "github" }) },
	});
	const stored: Array<{ name: string; value: string }> = [];
	const loader = makeLoader(loaded, {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		"@theholocron/holocron-plugin-github": makePlugin("gh", {
			secrets: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async (_s: unknown, name: string, value: string) => {
					if (!name.startsWith(PREFLIGHT_PREFIX)) stored.push({ name, value });
				},
				deleteSecret: async () => {},
			},
		}),
	});
	const lines: string[] = [];
	const log = fakeLogger();
	return {
		stored,
		lines,
		log,
		run: () =>
			runNotificationsSetup({
				loaded,
				context: {
					repoRoot: "/tmp/test",
					...("org" in opts ? (opts.org ? { org: opts.org } : {}) : { org: "theholocron" }),
					...(opts.dryRun ? { dryRun: true } : {}),
				},
				loader,
				print: (l) => lines.push(l),
				logger: log,
			}),
	};
}

describe("runNotificationsSetup", () => {
	it("applies the layout: channels under their categories, webhook secrets, roles", async () => {
		const n = fakeNotifications();
		const { run, stored, lines } = setup(n);
		const report = await run();
		expect(report.status).toBe("ok");
		expect(report.categories).toEqual(["ALERTS", "AUTOMATION", "EMPTY"]);
		expect(report.channels.map((c) => `${c.category}/${c.name}`)).toEqual([
			"ALERTS/alerts",
			"ALERTS/errors",
			"AUTOMATION/sync",
		]);
		expect(n.ensureChannel).toHaveBeenCalledWith({ name: "alerts", category: "ALERTS", topic: "needs a human" });
		expect(stored.map((s) => s.name)).toEqual(["HOLOCRON_NOTIFY_WEBHOOK_ALERTS", "HOLOCRON_NOTIFY_WEBHOOK_SYNC"]);
		expect(report.roles).toEqual([
			{ name: "gatekeepers", id: "99", created: true },
			{ name: "plain", id: "99", created: true },
		]);
		expect(n.ensureRole).toHaveBeenCalledWith({ name: "gatekeepers", mentionable: true });
		expect(n.ensureRole).toHaveBeenCalledWith({ name: "plain" });
		expect(lines.join("\n")).toContain("role gatekeepers (id 99)");
		expect(lines.join("\n")).not.toContain("https://hook/x");
	});

	it("previews every step on --dry-run and calls the provider for none of them", async () => {
		const n = fakeNotifications();
		const { run, lines, stored } = setup(n, { dryRun: true });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(n.ensureChannel).not.toHaveBeenCalled();
		expect(n.ensureWebhook).not.toHaveBeenCalled();
		expect(n.ensureCategory).not.toHaveBeenCalled();
		expect(n.ensureRole).not.toHaveBeenCalled();
		expect(stored).toEqual([]);
		expect(lines.join("\n")).toContain("would ensure role gatekeepers");
		expect(lines.join("\n")).toContain("would ensure category EMPTY");
		// 3 categories + 3 channels + 2 webhooks + 2 roles, all only previewed
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 10 skipped");
	});

	it("still counts a channel it created when its webhook then fails", async () => {
		const n = fakeNotifications({
			ensureWebhook: vi.fn(async () => {
				throw new Error("Missing Permissions");
			}),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.failures.map((f) => f.step)).toEqual(["channel alerts", "channel sync"]);
		// 3 categories + 3 channels + 2 roles made; the two webhook steps failed
		expect(lines.at(-1)).toBe("8 ok, 2 fail, 0 skipped");
	});

	it("counts channels that already exist as skipped", async () => {
		const n = fakeNotifications({ ensureChannel: vi.fn(async () => ({ id: "1", created: false })) });
		const { run, lines } = setup(n);
		await run();
		// 3 categories + 2 webhooks + 2 roles made; 3 channels already there
		expect(lines.at(-1)).toBe("7 ok, 0 fail, 3 skipped");
	});

	it("reports a role it changed as updated and counts it as ok", async () => {
		const n = fakeNotifications({
			layout: { roles: [{ name: "gatekeepers", color: "#f0b232", hoist: true }] },
			ensureRole: vi.fn(async () => ({ id: "99", created: false, updated: ["colour", "hoist"] })),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(lines.join("\n")).toContain("updated role gatekeepers (id 99): colour, hoist");
		expect(report.roles).toEqual([{ name: "gatekeepers", id: "99", created: false, updated: ["colour", "hoist"] }]);
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
		expect(n.ensureRole).toHaveBeenCalledWith({ name: "gatekeepers", color: "#f0b232", hoist: true });
	});

	it("passes the permissions of a role to the provider", async () => {
		const n = fakeNotifications({ layout: { roles: [{ name: "x", permissions: ["ViewChannel"] }] } });
		await setup(n).run();
		expect(n.ensureRole).toHaveBeenCalledWith({ name: "x", permissions: ["ViewChannel"] });
	});

	it("refuses a layout the provider cannot apply before creating anything", async () => {
		const n = fakeNotifications({ validateLayout: vi.fn(() => 'role `x`: invalid colour "red": use #rrggbb') });
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/use #rrggbb/);
		expect(lines.at(-1)).toBe("0 ok, 1 fail, 0 skipped");
		expect(n.ensureCategory).not.toHaveBeenCalled();
		expect(n.ensureChannel).not.toHaveBeenCalled();
		expect(n.ensureRole).not.toHaveBeenCalled();
	});

	it("creates roles before categories and channels, since a channel's access names them", async () => {
		const n = fakeNotifications();
		await setup(n).run();
		const role = (n.ensureRole as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
		const category = (n.ensureCategory as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
		expect(role).toBeLessThan(category);
	});

	it("gives a channel its own access over its category's, field by field", async () => {
		const n = fakeNotifications({
			layout: {
				roles: [{ name: "gatekeepers" }],
				categories: [
					{
						name: "STAFF",
						access: { view: ["gatekeepers"], post: [] },
						channels: [{ name: "talk", access: { post: ["gatekeepers"] } }, { name: "quiet" }],
					},
					{ name: "OPEN", channels: [{ name: "free" }] },
				],
			},
		});
		await setup(n).run();
		expect(n.ensureCategory).toHaveBeenCalledWith("STAFF", { access: { view: ["gatekeepers"], post: [] } });
		expect(n.ensureCategory).toHaveBeenCalledWith("OPEN", {});
		const calls = (n.ensureChannel as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		expect(calls[0]).toMatchObject({ name: "talk", access: { view: ["gatekeepers"], post: ["gatekeepers"] } });
		expect(calls[1]).toMatchObject({ name: "quiet", access: { view: ["gatekeepers"], post: [] } });
		expect(calls[2]).not.toHaveProperty("access");
	});

	it("shows what changed on a channel and a category that already existed", async () => {
		const n = fakeNotifications({
			ensureCategory: vi.fn(async () => ({ id: "c", created: false, updated: ["access"] })),
			ensureChannel: vi.fn(async () => ({ id: "1", created: false, updated: ["topic", "access"] })),
		});
		const { run, lines } = setup(n);
		await run();
		const out = lines.join("\n");
		expect(out).toContain("updated category ALERTS: access");
		expect(out).toContain("updated channel alerts in ALERTS: topic, access");
	});

	it("refuses an access that names a role the layout does not declare, before creating anything", async () => {
		for (const layout of [
			{ roles: [], categories: [{ name: "A", access: { view: ["ghosts"] } }] },
			{ roles: [], categories: [{ name: "A", channels: [{ name: "c", access: { post: ["ghosts"] } }] }] },
		] as NotificationsLayout[]) {
			const n = fakeNotifications({ layout });
			const report = await setup(n).run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/names the role `ghosts`, which is not in the layout's roles/);
			expect(n.ensureCategory).not.toHaveBeenCalled();
			expect(n.ensureRole).not.toHaveBeenCalled();
		}
	});

	it("accepts access roles whatever their case, and 'everyone'", async () => {
		const n = fakeNotifications({
			layout: {
				roles: [{ name: "gatekeepers" }],
				categories: [{ name: "A", access: { view: ["GateKeepers"], post: "everyone" } }],
			},
		});
		expect((await setup(n).run()).status).toBe("ok");
	});

	it("ends a refusal with the count too", async () => {
		const n = fakeNotifications({ layout: undefined });
		const { run, lines } = setup(n);
		await run();
		expect(lines.at(-1)).toBe("0 ok, 1 fail, 0 skipped");
	});

	it("keeps going after a failing step and exits fail", async () => {
		const n = fakeNotifications({
			ensureChannel: vi.fn(async (i: { name: string }) => {
				if (i.name === "errors") throw new Error("Missing Permissions");
				return { id: "1", created: true };
			}),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.failures).toEqual([{ step: "channel errors", message: "Missing Permissions" }]);
		expect(report.channels.map((c) => c.name)).toEqual(["alerts", "sync"]);
		expect(report.roles).toHaveLength(2);
		expect(lines.at(-1)).toBe("9 ok, 1 fail, 0 skipped");
	});

	it("counts a webhook it could not store as needing attention", async () => {
		const n = fakeNotifications({ ensureWebhook: vi.fn(async () => ({ created: false })) });
		const report = await setup(n).run();
		expect(report.status).toBe("fail");
		expect(report.failures.map((f) => f.step)).toEqual(["webhook alerts", "webhook sync"]);
	});

	it("fails a role step when the provider cannot manage roles", async () => {
		const n = fakeNotifications({ ensureRole: undefined });
		const report = await setup(n).run();
		expect(report.failures.map((f) => f.step)).toEqual(["role gatekeepers", "role plain"]);
		expect(report.failures[0]?.message).toMatch(/cannot manage roles/);
	});

	it("needs a declared layout", async () => {
		const { run } = setup(fakeNotifications({ layout: undefined }));
		expect(await run()).toMatchObject({ status: "fail", message: expect.stringMatching(/declares no layout/) });
	});

	it("needs a secrets provider when the layout asks for webhooks", async () => {
		const { run } = setup(fakeNotifications(), { secrets: false });
		expect(await run()).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/need a `secrets` capability/),
		});
	});

	it("needs an org for the webhook secrets", async () => {
		const { run } = setup(fakeNotifications(), { org: "" });
		expect(await run()).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/no org to store secrets/),
		});
	});

	it("runs a layout without webhooks and without a secrets provider", async () => {
		const layout: NotificationsLayout = { categories: [{ name: "BUILD", channels: [{ name: "dev" }] }] };
		const report = await setup(fakeNotifications({ layout }), { secrets: false, org: "" }).run();
		expect(report.status).toBe("ok");
		expect(report.roles).toEqual([]);
	});

	it("prints the reason for a refusal, so the user is never left with a bare exit code", async () => {
		const { run, lines } = setup(fakeNotifications({ layout: undefined }));
		await run();
		expect(lines.join("\n")).toMatch(/✗ the `discord` provider declares no layout/);
	});

	it("refuses when no notifications provider can provision", async () => {
		const post = { key: "notifications", providerName: "slack", send: async () => {} } as Notifications;
		expect(await setup(post).run()).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/can provision/),
		});
	});

	it("explains why the secrets provider is missing when it failed to load", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"], secrets: "github" } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
		});
		const report = await runNotificationsSetup({
			loaded,
			context: { repoRoot: "/tmp/test", org: "theholocron" },
			loader,
			print: () => {},
		});
		expect(report.message).toMatch(/need a `secrets` capability .*failed to load: .*holocron-plugin-github/);
	});

	it("previews the whole layout on --dry-run with no secrets provider and no org", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
		});
		const report = await runNotificationsSetup({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			loader,
			print: () => {},
		});
		expect(report.status).toBe("dry-run");
		expect(report.channels).toHaveLength(3);
	});

	it("creates every declared category on its own, including one with no channels", async () => {
		const n = fakeNotifications();
		await setup(n).run();
		expect(n.ensureCategory).toHaveBeenCalledTimes(3);
		expect(n.ensureCategory).toHaveBeenCalledWith("EMPTY", {});
	});

	it("goes on without categories when the provider has none", async () => {
		const n = fakeNotifications({ ensureCategory: undefined });
		const report = await setup(n).run();
		expect(report.status).toBe("ok");
		expect(report.channels).toHaveLength(3);
	});

	it("refuses two channels that would share one webhook secret", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "A",
					channels: [
						{ name: "release-notes", webhook: true },
						{ name: "release_notes", webhook: true },
					],
				},
			],
		};
		const n = fakeNotifications({ layout });
		const report = await setup(n).run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(
			/channel `release-notes` and channel `release_notes` would both store into HOLOCRON_NOTIFY_WEBHOOK_RELEASE_NOTES/
		);
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("allows the same default secret name to be overridden to avoid a clash", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "A",
					channels: [
						{ name: "release-notes", webhook: true },
						{ name: "release_notes", webhook: { secret: "OTHER" } },
					],
				},
			],
		};
		expect((await setup(fakeNotifications({ layout })).run()).status).toBe("ok");
	});

	it("runs a role-only layout against a provider that only manages roles", async () => {
		const rolesOnly = {
			key: "notifications",
			providerName: "r",
			send: async () => {},
			layout: { roles: [{ name: "gatekeepers" }] },
			ensureRole: vi.fn(async () => ({ id: "5", created: true })),
		} as unknown as Notifications;
		const report = await setup(rolesOnly).run();
		expect(report.status).toBe("ok");
		expect(report.roles).toEqual([{ name: "gatekeepers", id: "5", created: true }]);
	});

	it("refuses when no notifications provider is configured at all", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { secrets: "github" } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					listSecrets: async () => [] as string[],
					setSecret: async () => {},
					deleteSecret: async () => {},
				},
			}),
		});
		const report = await runNotificationsSetup({
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

	it("handles a layout whose only category declares no channels", async () => {
		const layout: NotificationsLayout = { categories: [{ name: "EMPTY" }] };
		const n = fakeNotifications({ layout });
		const report = await setup(n, { secrets: false, org: "" }).run();
		expect(report.status).toBe("ok");
		expect(n.ensureCategory).toHaveBeenCalledWith("EMPTY", {});
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("reports categories and roles that already exist as existing", async () => {
		const n = fakeNotifications({
			ensureCategory: vi.fn(async () => ({ id: "c", created: false })),
			ensureRole: vi.fn(async () => ({ id: "99", created: false })),
		});
		const { run, lines } = setup(n);
		await run();
		expect(lines.join("\n")).toContain("· exists  category ALERTS");
		expect(lines.join("\n")).toContain("· exists  role gatekeepers (id 99)");
	});

	it("counts what it made, what was already there and what failed", async () => {
		const n = fakeNotifications({
			ensureCategory: vi.fn(async () => ({ id: "c", created: false })),
			ensureRole: vi.fn(async () => ({ id: "99", created: false })),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.failures).toEqual([]);
		// 3 channels + 2 webhooks made; 3 categories + 2 roles already there
		expect(lines.at(-1)).toBe("5 ok, 0 fail, 5 skipped");
	});

	it("prints to the console when no print function is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", {
				notifications: fakeNotifications({ layout: { roles: [{ name: "x" }] } }),
			}),
		});
		await runNotificationsSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("1 ok, 0 fail, 0 skipped"));
		expect(log).not.toHaveBeenCalledWith(expect.stringContaining("notifications setup"));
		log.mockRestore();
	});

	it("checks the secrets store before creating anything, so a bad token leaves no orphan webhook", async () => {
		const n = fakeNotifications();
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"], secrets: "github" } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: n }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					listSecrets: async () => [] as string[],
					setSecret: async () => {
						throw new ProviderApiError(
							"GitHub GET /orgs/theholocron/actions/secrets/public-key → 403",
							403,
							'{"message":"Resource not accessible by personal access token"}'
						);
					},
					deleteSecret: async () => {},
				},
			}),
		});
		const lines: string[] = [];
		const report = await runNotificationsSetup({
			loaded,
			context: { repoRoot: "/tmp/test", org: "theholocron" },
			loader,
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/cannot write to the secrets store for organization theholocron/);
		expect(report.message).toContain("Resource not accessible by personal access token");
		expect(n.ensureCategory).not.toHaveBeenCalled();
		expect(n.ensureChannel).not.toHaveBeenCalled();
		expect(n.ensureWebhook).not.toHaveBeenCalled();
		expect(n.ensureRole).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("✗ cannot write to the secrets store");
	});

	it("shows the provider's response body for a failing step", async () => {
		const n = fakeNotifications({
			ensureChannel: vi.fn(async () => {
				throw new ProviderApiError(
					"Discord PATCH /channels/9 → 403",
					403,
					'{"message":"Missing Permissions","code":50013}'
				);
			}),
		});
		const { run } = setup(n);
		const report = await run();
		expect(report.failures[0]?.message).toBe(
			'Discord PATCH /channels/9 → 403: {"message":"Missing Permissions","code":50013}'
		);
	});

	describe("a role's id stored in a secret", () => {
		const roleLayout: NotificationsLayout = {
			roles: [{ name: "gatekeepers", mentionable: true, secret: "HOLOCRON_NOTIFY_ALERT_ROLE" }],
		};

		it("stores the id so a workflow can ping the role with nothing copied by hand", async () => {
			const { run, stored, lines } = setup(fakeNotifications({ layout: roleLayout }));
			const report = await run();
			expect(report.status).toBe("ok");
			expect(stored).toEqual([{ name: "HOLOCRON_NOTIFY_ALERT_ROLE", value: "99" }]);
			expect(report.roles).toEqual([
				{ name: "gatekeepers", id: "99", created: true, secret: "HOLOCRON_NOTIFY_ALERT_ROLE", stored: true },
			]);
			expect(lines.join("\n")).toContain("stored the id of gatekeepers in HOLOCRON_NOTIFY_ALERT_ROLE");
		});

		it("stores the id of a role that already existed, so the secret is repaired on a re-run", async () => {
			const n = fakeNotifications({
				layout: roleLayout,
				ensureRole: vi.fn(async () => ({ id: "1562979974502424668", created: false })),
			});
			const { run, stored } = setup(n);
			await run();
			expect(stored).toEqual([{ name: "HOLOCRON_NOTIFY_ALERT_ROLE", value: "1562979974502424668" }]);
		});

		it("previews it on --dry-run and stores nothing", async () => {
			const n = fakeNotifications({ layout: roleLayout });
			const { run, stored, lines } = setup(n, { dryRun: true });
			const report = await run();
			expect(report.status).toBe("dry-run");
			expect(stored).toEqual([]);
			expect(n.ensureRole).not.toHaveBeenCalled();
			expect(lines.join("\n")).toContain(
				"would ensure role gatekeepers and store its id in HOLOCRON_NOTIFY_ALERT_ROLE"
			);
			expect(report.roles[0]).toMatchObject({ secret: "HOLOCRON_NOTIFY_ALERT_ROLE" });
		});

		it("needs a secrets provider even when the layout has no webhooks", async () => {
			const { run } = setup(fakeNotifications({ layout: roleLayout }), { secrets: false });
			expect(await run()).toMatchObject({
				status: "fail",
				message: expect.stringMatching(/need a `secrets` capability/),
			});
		});

		it("needs an org (or a scope) to store it under", async () => {
			const { run } = setup(fakeNotifications({ layout: roleLayout }), { org: "" });
			expect(await run()).toMatchObject({
				status: "fail",
				message: expect.stringMatching(/no org to store secrets under/),
			});
		});

		it("reports a failed store as a failing step and keeps going", async () => {
			const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"], secrets: "github" } });
			const loader = makeLoader(loaded, {
				"@theholocron/holocron-plugin-discord": makePlugin("discord", {
					notifications: fakeNotifications({
						layout: { roles: [{ name: "a", secret: "A_SECRET" }, { name: "b" }] },
					}),
				}),
				"@theholocron/holocron-plugin-github": makePlugin("gh", {
					secrets: {
						providerName: "github",
						listSecrets: async () => [] as string[],
						setSecret: async (_s: unknown, name: string) => {
							if (name === "A_SECRET") throw new Error("403 nope");
						},
						deleteSecret: async () => {},
					},
				}),
			});
			const report = await runNotificationsSetup({
				loaded,
				context: { repoRoot: "/tmp/test", org: "theholocron" },
				loader,
				print: () => {},
			});
			expect(report.status).toBe("fail");
			expect(report.failures).toEqual([{ step: "role a", message: "403 nope" }]);
			expect(report.roles.map((r) => r.name)).toEqual(["a", "b"]);
		});

		it("refuses a role secret that a webhook also writes to", async () => {
			const n = fakeNotifications({
				layout: {
					categories: [{ name: "A", channels: [{ name: "alerts", webhook: { secret: "SHARED" } }] }],
					roles: [{ name: "gatekeepers", secret: "SHARED" }],
				},
			});
			const report = await setup(n).run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/`alerts` and role `gatekeepers` would both store into SHARED/);
			expect(n.ensureChannel).not.toHaveBeenCalled();
		});

		it("refuses two roles that would share one secret, and provisions and stores nothing", async () => {
			const n = fakeNotifications({
				layout: {
					roles: [
						{ name: "a", secret: "SAME" },
						{ name: "b", secret: "SAME" },
					],
				},
			});
			const { run, stored } = setup(n);
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/role `a` and role `b` would both store into SAME/);
			expect(n.ensureRole).not.toHaveBeenCalled();
			expect(n.ensureCategory).not.toHaveBeenCalled();
			expect(stored).toEqual([]);
			expect(report.roles).toEqual([]);
		});

		it("treats secret names as case-insensitive, as GitHub does", async () => {
			const n = fakeNotifications({
				layout: {
					categories: [
						{
							name: "A",
							channels: [{ name: "alerts", webhook: { secret: "Holocron_Notify_Alert_Role" } }],
						},
					],
					roles: [{ name: "gatekeepers", secret: "HOLOCRON_NOTIFY_ALERT_ROLE" }],
				},
			});
			const { run, stored } = setup(n);
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(
				/channel `alerts` and role `gatekeepers` would both store into HOLOCRON_NOTIFY_ALERT_ROLE/
			);
			expect(n.ensureChannel).not.toHaveBeenCalled();
			expect(stored).toEqual([]);
		});

		it.each(["HOLOCRON_NOTIFY_PREFLIGHT", "holocron_notify_preflight_abc", "HOLOCRON_NOTIFY_PREFLIGHT_1234ABCD"])(
			"refuses %s as a role secret, since the preflight reserves that name",
			async (secret) => {
				const n = fakeNotifications({ layout: { roles: [{ name: "gatekeepers", secret }] } });
				const { run, stored } = setup(n);
				const report = await run();
				expect(report.status).toBe("fail");
				expect(report.message).toMatch(/reserved for the setup preflight/);
				expect(n.ensureRole).not.toHaveBeenCalled();
				expect(stored).toEqual([]);
			}
		);

		it("refuses a reserved name as a webhook secret too", async () => {
			const n = fakeNotifications({
				layout: {
					categories: [
						{ name: "A", channels: [{ name: "x", webhook: { secret: "HOLOCRON_NOTIFY_PREFLIGHT_X" } }] },
					],
				},
			});
			const report = await setup(n).run();
			expect(report.message).toMatch(/channel `x` would store into HOLOCRON_NOTIFY_PREFLIGHT_X, a name reserved/);
			expect(n.ensureChannel).not.toHaveBeenCalled();
		});
	});
});
