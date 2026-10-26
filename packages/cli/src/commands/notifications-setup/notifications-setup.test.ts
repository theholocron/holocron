import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Monitoring, Notifications, NotificationsLayout } from "../../plugin/index.js";
import { ElevationRequiredError, type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
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

function setup(
	notifications: Notifications,
	opts: {
		secrets?: boolean;
		dryRun?: boolean;
		org?: string;
		monitoring?: Partial<Monitoring>;
		loadAvatar?: (source: string) => Promise<string>;
		pause?: ((message: string) => Promise<void>) | false;
	} = {}
) {
	const loaded = loadedFrom({
		name: "demo",
		providers: {
			notifications: ["discord"],
			...(opts.secrets === false ? {} : { secrets: "github" }),
			...(opts.monitoring ? { monitoring: "checkly" } : {}),
		},
	});
	const stored: Array<{ name: string; value: string }> = [];
	const loader = makeLoader(loaded, {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		...(opts.monitoring
			? {
					"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
						monitoring: { key: "monitoring", providerName: "checkly", checks: [], ...opts.monitoring },
					}),
				}
			: {}),
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
				...(opts.loadAvatar ? { loadAvatar: opts.loadAvatar } : {}),
				...(opts.pause ? { pause: opts.pause } : {}),
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

	it("skips a category's channels when the category itself failed, so none is recreated without its access", async () => {
		const n = fakeNotifications({
			layout: {
				roles: [{ name: "gatekeepers" }],
				categories: [
					{ name: "STAFF", access: { view: ["gatekeepers"] }, channels: [{ name: "a" }, { name: "b" }] },
					{ name: "OPEN", channels: [{ name: "c" }] },
				],
			},
			ensureCategory: vi.fn(async (name: string) => {
				if (name === "STAFF") throw new Error("Missing Permissions");
				return { id: "c", created: true };
			}),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.failures).toEqual([{ step: "category STAFF", message: "Missing Permissions" }]);
		expect(lines.join("\n")).toContain("skipped 2 channels: the category failed");
		expect((n.ensureChannel as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].name)).toEqual(["c"]);
		expect(lines.at(-1)).toBe("3 ok, 1 fail, 2 skipped");
	});

	it("says 'channel' for a single skipped channel", async () => {
		const n = fakeNotifications({
			layout: { categories: [{ name: "X", channels: [{ name: "only" }] }] },
			ensureCategory: vi.fn(async () => {
				throw new Error("nope");
			}),
		});
		const { run, lines } = setup(n);
		await run();
		expect(lines.join("\n")).toContain("skipped 1 channel: the category failed");
	});

	it("refuses a category access when the provider cannot manage categories", async () => {
		const n = fakeNotifications({
			layout: { roles: [{ name: "g" }], categories: [{ name: "X", access: { view: ["g"] } }] },
			ensureCategory: undefined,
		});
		const report = await setup(n).run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(
			/category `X` declares `access`, but the `discord` provider cannot manage categories/
		);
		expect(n.ensureRole).not.toHaveBeenCalled();
	});

	it("refuses a role that may post but could not see the channel", async () => {
		for (const [layout, who] of [
			[
				{
					roles: [{ name: "a" }, { name: "b" }],
					categories: [{ name: "X", access: { view: ["a"], post: ["a", "b"] } }],
				},
				"category `X`",
			],
			[
				{
					roles: [{ name: "a" }, { name: "b" }],
					categories: [
						{ name: "X", access: { view: ["a"] }, channels: [{ name: "c", access: { post: ["B"] } }] },
					],
				},
				"channel `c`",
			],
		] as Array<[NotificationsLayout, string]>) {
			const n = fakeNotifications({ layout });
			const report = await setup(n).run();
			expect(report.message).toMatch(new RegExp(`${who}: the role \`b\`|${who}: the role \`B\``, "i"));
			expect(report.message).toMatch(/may post but is not in `view`/);
			expect(n.ensureCategory).not.toHaveBeenCalled();
		}
	});

	it("accepts post roles that are also in view, and 'everyone' on either side", async () => {
		const n = fakeNotifications({
			layout: {
				roles: [{ name: "a" }],
				categories: [
					{ name: "X", access: { view: ["A"], post: ["a"] } },
					{ name: "Y", access: { view: "everyone", post: ["a"] } },
					{ name: "Z", access: { view: ["a"], post: "everyone" } },
				],
			},
		});
		expect((await setup(n).run()).status).toBe("ok");
	});

	describe("server settings", () => {
		const SERVER_LAYOUT: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "welcome" }, { name: "rules" }, { name: "staff" }] }],
			server: {
				verification: "medium",
				systemChannel: "Welcome",
				rulesChannel: "rules",
				updatesChannel: "staff",
				community: true,
			},
		};

		it("applies them last, after the channels exist, and counts a change as ok", async () => {
			const ensureServer = vi.fn(async () => ({ updated: ["verification", "community"] }));
			const n = fakeNotifications({ layout: SERVER_LAYOUT, ensureServer });
			const { run, lines } = setup(n);
			const report = await run();
			expect(report.status).toBe("ok");
			expect(ensureServer).toHaveBeenCalledWith(SERVER_LAYOUT.server);
			expect(ensureServer.mock.invocationCallOrder[0]).toBeGreaterThan(
				(n.ensureChannel as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!
			);
			expect(lines.join("\n")).toContain("updated server settings: verification, community");
			expect(lines.at(-1)).toBe("5 ok, 0 fail, 0 skipped");
		});

		it("shows a server that already matches as skipped", async () => {
			const n = fakeNotifications({ layout: SERVER_LAYOUT, ensureServer: vi.fn(async () => ({ updated: [] })) });
			const { run, lines } = setup(n);
			await run();
			expect(lines.join("\n")).toContain("exists  server settings");
			expect(lines.at(-1)).toBe("4 ok, 0 fail, 1 skipped");
		});

		it("previews them on --dry-run without calling the provider", async () => {
			const ensureServer = vi.fn(async () => ({ updated: [] }));
			const n = fakeNotifications({ layout: SERVER_LAYOUT, ensureServer });
			const { run, lines } = setup(n, { dryRun: true });
			await run();
			expect(ensureServer).not.toHaveBeenCalled();
			expect(lines.join("\n")).toContain("would ensure server settings");
		});

		it("records a failing server step and goes on", async () => {
			const n = fakeNotifications({
				layout: SERVER_LAYOUT,
				ensureServer: vi.fn(async () => {
					throw new Error("the bot lacks Manage Server");
				}),
			});
			const { run } = setup(n);
			const report = await run();
			expect(report.failures).toEqual([{ step: "server settings", message: "the bot lacks Manage Server" }]);
		});

		it("refuses a provider that cannot manage server settings", async () => {
			const n = fakeNotifications({ layout: SERVER_LAYOUT, ensureServer: undefined });
			const report = await setup(n).run();
			expect(report.message).toMatch(/declares `server` settings, but the `discord` provider cannot manage them/);
			expect(n.ensureCategory).not.toHaveBeenCalled();
		});

		it("refuses a test channel that is not in the layout or declares no webhook", async () => {
			const ghost = fakeNotifications({
				layout: { categories: [{ name: "A", channels: [{ name: "x", webhook: true }] }], testChannel: "ghost" },
			});
			expect((await setup(ghost).run()).message).toMatch(/`testChannel` names the channel `ghost`/);
			const bare = fakeNotifications({
				layout: {
					categories: [{ name: "Empty" }, { name: "A", channels: [{ name: "x" }] }],
					testChannel: "x",
				},
			});
			expect((await setup(bare).run()).message).toMatch(/`testChannel` names `x`, which declares no webhook/);
			const fine = fakeNotifications({
				layout: { categories: [{ name: "A", channels: [{ name: "x", webhook: true }] }], testChannel: "X" },
			});
			expect((await setup(fine).run()).message ?? "").not.toMatch(/testChannel/);
		});

		it("refuses a server channel the layout does not declare, and community without both channels", async () => {
			const missing = fakeNotifications({
				layout: { categories: [{ name: "A", channels: [{ name: "x" }] }], server: { systemChannel: "ghost" } },
				ensureServer: vi.fn(),
			});
			expect((await setup(missing).run()).message).toMatch(/`systemChannel` names the channel `ghost`/);
			const community = fakeNotifications({
				layout: {
					categories: [{ name: "A", channels: [{ name: "r" }] }],
					server: { community: true, rulesChannel: "r" },
				},
				ensureServer: vi.fn(),
			});
			expect((await setup(community).run()).message).toMatch(/community: true` needs both/);
			expect(missing.ensureCategory).not.toHaveBeenCalled();
		});

		it("refuses a server channel when the layout has no categories, or categories with no channels", async () => {
			for (const layout of [
				{ server: { systemChannel: "x" } },
				{ categories: [{ name: "Empty" }], server: { systemChannel: "x" } },
			] as NotificationsLayout[]) {
				const report = await setup(fakeNotifications({ layout, ensureServer: vi.fn() })).run();
				expect(report.message).toMatch(/`systemChannel` names the channel `x`/);
			}
		});

		it("refuses a server channel that two channels in the layout share", async () => {
			const layout: NotificationsLayout = {
				categories: [
					{ name: "A", channels: [{ name: "rules" }] },
					{ name: "B", channels: [{ name: "Rules" }] },
				],
				server: { rulesChannel: "rules" },
			};
			const report = await setup(fakeNotifications({ layout, ensureServer: vi.fn() })).run();
			expect(report.message).toMatch(
				/`rulesChannel` names `rules`, but more than one channel in the layout has that name/
			);
		});

		it("checks the bot can change the server before creating anything, and stops there if it cannot", async () => {
			const preflight = vi.fn(async () => {
				throw new Error("the bot lacks Manage Server: https://example.test/invite");
			});
			const n = fakeNotifications({ layout: SERVER_LAYOUT, ensureServer: vi.fn(), preflight });
			const { run, lines } = setup(n);
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/lacks Manage Server/);
			expect(n.ensureRole).not.toHaveBeenCalled();
			expect(n.ensureCategory).not.toHaveBeenCalled();
			expect(lines.at(-1)).toBe("0 ok, 1 fail, 0 skipped");
		});

		it("runs the preflight with the layout, and skips it on a dry run", async () => {
			const preflight = vi.fn(async () => {});
			await setup(
				fakeNotifications({
					layout: SERVER_LAYOUT,
					ensureServer: vi.fn(async () => ({ updated: [] })),
					preflight,
				})
			).run();
			expect(preflight).toHaveBeenCalledWith(SERVER_LAYOUT);
			const dry = vi.fn(async () => {});
			await setup(fakeNotifications({ layout: SERVER_LAYOUT, ensureServer: vi.fn(), preflight: dry }), {
				dryRun: true,
			}).run();
			expect(dry).not.toHaveBeenCalled();
		});

		describe("welcome screen and onboarding", () => {
			const WO_LAYOUT: NotificationsLayout = {
				roles: [{ name: "Readers" }],
				categories: [{ name: "A", channels: [{ name: "rules" }, { name: "dev" }] }],
				welcome: { description: "Hello", channels: [{ channel: "rules", description: "Be kind" }] },
				onboarding: {
					defaultChannels: ["dev"],
					prompts: [{ title: "Q", options: [{ title: "Dev", channels: ["DEV"], roles: ["readers"] }] }],
				},
			};

			it("applies each after the channels and roles exist, and counts a change as ok", async () => {
				const ensureWelcome = vi.fn(async () => ({ updated: ["description", "channels"] }));
				const ensureOnboarding = vi.fn(async () => ({ updated: ["prompts"] }));
				const n = fakeNotifications({ layout: WO_LAYOUT, ensureWelcome, ensureOnboarding });
				const { run, lines } = setup(n);
				await run();
				expect(ensureWelcome).toHaveBeenCalledWith(WO_LAYOUT.welcome);
				expect(ensureOnboarding).toHaveBeenCalledWith(WO_LAYOUT.onboarding);
				const lastChannel = (n.ensureChannel as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
				expect(ensureWelcome.mock.invocationCallOrder[0]).toBeGreaterThan(lastChannel);
				expect(ensureOnboarding.mock.invocationCallOrder[0]).toBeGreaterThan(lastChannel);
				const lastRole = (n.ensureRole as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
				expect(ensureOnboarding.mock.invocationCallOrder[0]).toBeGreaterThan(lastRole);
				const out = lines.join("\n");
				expect(out).toContain("updated welcome screen: description, channels");
				expect(out).toContain("updated onboarding: prompts");
			});

			it("shows ones that already match as skipped, previews them on --dry-run, and records a failure", async () => {
				const same = fakeNotifications({
					layout: WO_LAYOUT,
					ensureWelcome: vi.fn(async () => ({ updated: [] })),
					ensureOnboarding: vi.fn(async () => ({ updated: [] })),
				});
				const { run, lines } = setup(same);
				await run();
				expect(lines.join("\n")).toContain("exists  welcome screen");
				expect(lines.join("\n")).toContain("exists  onboarding");
				const welcome = vi.fn(async () => ({ updated: [] }));
				const dry = setup(
					fakeNotifications({ layout: WO_LAYOUT, ensureWelcome: welcome, ensureOnboarding: vi.fn() }),
					{
						dryRun: true,
					}
				);
				await dry.run();
				expect(welcome).not.toHaveBeenCalled();
				expect(dry.lines.join("\n")).toContain("would ensure welcome screen");
				expect(dry.lines.join("\n")).toContain("would ensure onboarding");
				const failing = setup(
					fakeNotifications({
						layout: WO_LAYOUT,
						ensureWelcome: vi.fn(async () => {
							throw new Error("needs community");
						}),
						ensureOnboarding: vi.fn(async () => ({ updated: [] })),
					})
				);
				const report = await failing.run();
				expect(report.failures).toEqual([{ step: "welcome screen", message: "needs community" }]);
			});

			it("leaves out whichever section the layout does not declare", async () => {
				const ensureOnboarding = vi.fn(async () => ({ updated: [] }));
				const n = fakeNotifications({
					layout: { welcome: WO_LAYOUT.welcome, categories: WO_LAYOUT.categories },
					ensureWelcome: vi.fn(async () => ({ updated: [] })),
					ensureOnboarding,
				});
				await setup(n).run();
				expect(ensureOnboarding).not.toHaveBeenCalled();
			});

			it("refuses a provider that cannot manage them", async () => {
				const noWelcome = await setup(
					fakeNotifications({ layout: WO_LAYOUT, ensureWelcome: undefined, ensureOnboarding: vi.fn() })
				).run();
				expect(noWelcome.message).toMatch(
					/declares a `welcome` screen, but the `discord` provider cannot manage one/
				);
				const noOnboarding = await setup(
					fakeNotifications({ layout: WO_LAYOUT, ensureWelcome: vi.fn(), ensureOnboarding: undefined })
				).run();
				expect(noOnboarding.message).toMatch(
					/declares `onboarding`, but the `discord` provider cannot manage it/
				);
			});

			it("refuses names the layout does not have, or has twice, before creating anything", async () => {
				const cases: Array<[NotificationsLayout, RegExp]> = [
					[
						{
							...WO_LAYOUT,
							welcome: { description: "x", channels: [{ channel: "ghost", description: "y" }] },
						},
						/welcome: names the channel `ghost`, which is not in the layout's channels/,
					],
					[
						{ ...WO_LAYOUT, onboarding: { defaultChannels: ["ghost"] } },
						/onboarding: `defaultChannels` names the channel `ghost`/,
					],
					[
						{
							...WO_LAYOUT,
							onboarding: { prompts: [{ title: "Q", options: [{ title: "O", channels: ["ghost"] }] }] },
						},
						/onboarding: the option `O` names the channel `ghost`/,
					],
					[
						{
							...WO_LAYOUT,
							onboarding: { prompts: [{ title: "Q", options: [{ title: "O", roles: ["Ghosts"] }] }] },
						},
						/the option `O` gives the role `Ghosts`, which is not in the layout's roles/,
					],
					[
						{
							...WO_LAYOUT,
							categories: [
								{ name: "A", channels: [{ name: "dev" }] },
								{ name: "B", channels: [{ name: "Dev" }] },
							],
							welcome: { description: "x", channels: [{ channel: "dev", description: "y" }] },
						},
						/welcome: names `dev`, but more than one channel in the layout has that name/,
					],
				];
				for (const [layout, message] of cases) {
					const n = fakeNotifications({ layout, ensureWelcome: vi.fn(), ensureOnboarding: vi.fn() });
					const report = await setup(n).run();
					expect(report.message).toMatch(message);
					expect(n.ensureCategory).not.toHaveBeenCalled();
				}
			});

			it("accepts a layout whose onboarding states neither channels nor roles, and one with no categories", async () => {
				const n = fakeNotifications({
					layout: {
						onboarding: { prompts: [{ title: "Q", options: [{ title: "O" }] }] },
					},
					ensureOnboarding: vi.fn(async () => ({ updated: [] })),
				});
				expect((await setup(n).run()).status).toBe("ok");
			});
		});

		it("does nothing about the server when the layout declares none", async () => {
			const ensureServer = vi.fn(async () => ({ updated: [] }));
			await setup(fakeNotifications({ ensureServer })).run();
			expect(ensureServer).not.toHaveBeenCalled();
		});
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

	it("does not load the providers again when the caller already did", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", {
				notifications: fakeNotifications({ layout: { roles: [{ name: "x" }] } }),
			}),
		});
		await loader.load();
		const reload = vi.spyOn(loader, "load");
		const report = await runNotificationsSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			preloaded: true,
			print: () => {},
			logger: fakeLogger(),
		});
		expect(report.status).toBe("ok");
		expect(reload).not.toHaveBeenCalled();
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

describe("runNotificationsSetup — webhook avatars", () => {
	const withAvatar = (extra: Partial<NotificationsLayout> = {}): NotificationsLayout => ({
		...LAYOUT,
		webhookAvatar: "media/a.png",
		...extra,
	});

	it("reads the picture once and gives it to every webhook that has none of its own", async () => {
		const load = vi.fn(async (source: string) => `data:image/png;base64,${source}`);
		const n = fakeNotifications({ layout: withAvatar() });
		await setup(n, { loadAvatar: load }).run();
		expect(load).toHaveBeenCalledTimes(1);
		expect(n.ensureWebhook).toHaveBeenCalledTimes(2);
		// the webhook with its own settings keeps them, and gets the picture too
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "alerts", avatar: "data:image/png;base64,media/a.png" })
		);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "sync", avatar: "data:image/png;base64,media/a.png" })
		);
	});

	it("lets a webhook name a picture of its own", async () => {
		const load = vi.fn(async (source: string) => `data:image/png;base64,${source}`);
		const layout = withAvatar({
			categories: [
				{
					name: "A",
					channels: [
						{ name: "x", webhook: { avatar: "own.png" } },
						{ name: "y", webhook: true },
					],
				},
			],
		});
		const n = fakeNotifications({ layout });
		await setup(n, { loadAvatar: load }).run();
		expect(load).toHaveBeenCalledTimes(2);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "x", avatar: "data:image/png;base64,own.png" })
		);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "y", avatar: "data:image/png;base64,media/a.png" })
		);
	});

	it("sends no picture when none is declared", async () => {
		const n = fakeNotifications();
		await setup(n).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith({ channel: "alerts", name: "alerts", category: "ALERTS" });
	});

	it("stops before creating anything when a picture cannot be read", async () => {
		const n = fakeNotifications({ layout: withAvatar() });
		const { run, lines } = setup(n, {
			loadAvatar: async () => {
				throw new Error("ENOENT");
			},
		});
		const report = await run();
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toContain("webhook avatar `media/a.png`: ENOENT");
		expect(n.ensureRole).not.toHaveBeenCalled();
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("reads a picture from disk when nothing else reads it", async () => {
		const dir = await mkdtemp(join(tmpdir(), "avatar-"));
		const file = join(dir, "a.png");
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		await writeFile(file, png);
		const n = fakeNotifications({ layout: withAvatar({ webhookAvatar: file }) });
		await setup(n).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ avatar: `data:image/png;base64,${png.toString("base64")}` })
		);
	});
});

describe("runNotificationsSetup — bot application and everyone", () => {
	const AE_LAYOUT: NotificationsLayout = {
		categories: [{ name: "A", channels: [{ name: "dev" }] }],
		everyone: { deny: ["MentionEveryone"] },
		application: { description: "Posts things", tags: ["a"] },
	};

	it("applies both after the channels, reporting what changed and what already matched", async () => {
		const ensureEveryone = vi.fn(async () => ({ updated: ["MentionEveryone"] }));
		const ensureApplication = vi.fn(async () => ({ updated: [] }));
		const n = fakeNotifications({ layout: AE_LAYOUT, ensureEveryone, ensureApplication });
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.status).toBe("ok");
		expect(ensureEveryone).toHaveBeenCalledWith(AE_LAYOUT.everyone);
		expect(ensureApplication).toHaveBeenCalledWith(AE_LAYOUT.application);
		const lastChannel = (n.ensureChannel as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
		expect(ensureEveryone.mock.invocationCallOrder[0]).toBeGreaterThan(lastChannel);
		expect(ensureApplication.mock.invocationCallOrder[0]).toBeGreaterThan(lastChannel);
		const out = lines.join("\n");
		expect(out).toContain("updated @everyone permissions: MentionEveryone");
		expect(out).toContain("exists  bot application");
	});

	it("previews them on --dry-run and records a failure", async () => {
		const dry = fakeNotifications({ layout: AE_LAYOUT, ensureEveryone: vi.fn(), ensureApplication: vi.fn() });
		const { run, lines } = setup(dry, { dryRun: true });
		await run();
		expect(lines.join("\n")).toContain("would ensure bot application");
		expect(dry.ensureApplication).not.toHaveBeenCalled();
		expect(dry.ensureEveryone).not.toHaveBeenCalled();
		const failing = fakeNotifications({
			layout: AE_LAYOUT,
			ensureEveryone: vi.fn(async () => ({ updated: [] })),
			ensureApplication: vi.fn(async () => {
				throw new Error("nope");
			}),
		});
		const out = await setup(failing).run();
		expect(out.status).toBe("fail");
		expect(out.failures[0]?.step).toBe("bot application");
	});

	it("refuses a provider that cannot manage them, and a permission in both lists", async () => {
		const noApp = setup(fakeNotifications({ layout: { application: { tags: ["a"] } } }));
		expect((await noApp.run()).message).toMatch(
			/declares `application` settings, but the `discord` provider cannot manage them/
		);
		const noEveryone = setup(fakeNotifications({ layout: { everyone: { deny: ["X"] } } }));
		expect((await noEveryone.run()).message).toMatch(
			/declares `everyone` permissions, but the `discord` provider cannot/
		);
		const clash = setup(
			fakeNotifications({
				layout: { everyone: { allow: ["MentionEveryone"], deny: ["mentioneveryone"] } },
				ensureEveryone: vi.fn(),
			})
		);
		expect((await clash.run()).message).toMatch(/everyone: `MentionEveryone` is in both `allow` and `deny`/);
		const emptyTeam = setup(fakeNotifications({ layout: { roles: [{ name: "gatekeepers", team: " " }] } }));
		expect((await emptyTeam.run()).message).toMatch(/role `gatekeepers` has an empty `team`/);
		const twoTeams = setup(
			fakeNotifications({
				layout: {
					roles: [
						{ name: "g", team: "a" },
						{ name: "G", team: "b" },
					],
				},
			})
		);
		expect((await twoTeams.run()).message).toMatch(/declared for two teams/);
	});

	it("shows what only a person can do as a failure, and still counts what it changed", async () => {
		const n = fakeNotifications({
			layout: { application: { redirectUris: ["http://localhost:53682/callback"] } },
			ensureApplication: vi.fn(async () => ({
				updated: [],
				todo: ["add http://localhost:53682/callback under OAuth2 → Redirects"],
			})),
		});
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.failures).toEqual([
			{ step: "bot application", message: "add http://localhost:53682/callback under OAuth2 → Redirects" },
		]);
		expect(lines.join("\n")).toContain("bot application: add http://localhost:53682/callback");
	});

	it("accepts a layout that only allows, or only denies", async () => {
		const only = fakeNotifications({
			layout: { everyone: { allow: ["ViewChannel"] } },
			ensureEveryone: vi.fn(async () => ({ updated: [] })),
		});
		expect((await setup(only).run()).status).toBe("ok");
	});
});

describe("pinned messages", () => {
	const PINNED_LAYOUT: NotificationsLayout = {
		categories: [{ name: "A", channels: [{ name: "welcome" }] }],
		pinned: [{ channel: "welcome", content: "Hello" }],
	};

	it("posts them after the channels exist, and counts a change as ok", async () => {
		const ensurePinned = vi.fn(async () => ({ updated: ["#welcome"] }));
		const n = fakeNotifications({ layout: PINNED_LAYOUT, ensurePinned });
		const { run, lines } = setup(n);
		const report = await run();
		expect(report.status).toBe("ok");
		expect(ensurePinned).toHaveBeenCalledWith(PINNED_LAYOUT.pinned);
		expect(ensurePinned.mock.invocationCallOrder[0]).toBeGreaterThan(
			(n.ensureChannel as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!
		);
		expect(lines.join("\n")).toContain("updated pinned messages: #welcome");
	});

	it("only previews them on a dry run", async () => {
		const ensurePinned = vi.fn();
		const { run, lines } = setup(fakeNotifications({ layout: PINNED_LAYOUT, ensurePinned }), { dryRun: true });
		await run();
		expect(ensurePinned).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("would ensure pinned messages");
	});

	it("needs no support from the provider for an empty list", async () => {
		const report = await setup(fakeNotifications({ layout: { ...PINNED_LAYOUT, pinned: [] } })).run();
		expect(report.status).toBe("ok");
	});

	it("refuses a message for a channel not in the layout, an empty one, or a provider that cannot pin", async () => {
		const unknown = await setup(
			fakeNotifications({
				layout: { ...PINNED_LAYOUT, pinned: [{ channel: "nope", content: "x" }] },
				ensurePinned: vi.fn(),
			})
		).run();
		expect(unknown.status).toBe("fail");
		expect(unknown.message).toMatch(/pinned: names the channel `nope`/);
		const empty = await setup(
			fakeNotifications({
				layout: { ...PINNED_LAYOUT, pinned: [{ channel: "welcome", content: "  " }] },
				ensurePinned: vi.fn(),
			})
		).run();
		expect(empty.message).toMatch(/message for `welcome` is empty/);
		const cannot = await setup(fakeNotifications({ layout: PINNED_LAYOUT })).run();
		expect(cannot.message).toMatch(/cannot manage them/);
	});
});

describe("a permission given for one edit", () => {
	const LAYOUT_S: NotificationsLayout = {
		categories: [{ name: "A", channels: [{ name: "rules" }] }],
		server: { verification: "low" },
	};
	const needsIt = () =>
		new ElevationRequiredError("community was refused", {
			permission: "Administrator",
			grantUrl: "https://grant",
			revokeUrl: "https://revoke",
		});
	const flaky = () => {
		let calls = 0;
		return vi.fn(async () => {
			if (calls++ === 0) throw needsIt();
			return { updated: ["community"] };
		});
	};

	it("walks a person through giving it, retrying, and taking it away, then checks it is gone", async () => {
		const pause = vi.fn(async () => {});
		const ensureServer = flaky();
		const holdsPermission = vi.fn(async () => false);
		const { run, lines } = setup(fakeNotifications({ layout: LAYOUT_S, ensureServer, holdsPermission }), { pause });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(ensureServer).toHaveBeenCalledTimes(2);
		expect(pause).toHaveBeenCalledTimes(2);
		expect(holdsPermission).toHaveBeenCalledWith("Administrator");
		const out = lines.join("\n");
		expect(out).toContain("https://grant");
		expect(out).toContain("https://revoke");
		expect(out).toContain("Administrator is gone again");
		expect(out).toContain("updated server settings: community");
	});

	it("fails the run when the permission is still held afterwards", async () => {
		const { run } = setup(
			fakeNotifications({
				layout: LAYOUT_S,
				ensureServer: flaky(),
				holdsPermission: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
			}),
			{ pause: async () => {} }
		);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]?.message).toMatch(/still holds Administrator/);
	});

	it("fails the run when the provider cannot answer whether the permission is gone", async () => {
		const report = await setup(fakeNotifications({ layout: LAYOUT_S, ensureServer: flaky() }), {
			pause: async () => {},
		}).run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]?.message).toMatch(/could not check that Administrator is gone/);
	});

	it("takes the permission away and checks it even when the retry fails, and says what it could not do", async () => {
		const pause = vi.fn(async () => {});
		const holdsPermission = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		let calls = 0;
		const ensureServer = vi.fn(async () => {
			if (calls++ === 0) throw needsIt();
			throw new Error("still refused");
		});
		const { run, lines } = setup(fakeNotifications({ layout: LAYOUT_S, ensureServer, holdsPermission }), { pause });
		const report = await run();
		expect(report.failures[0]?.message).toBe("still refused");
		expect(pause).toHaveBeenCalledTimes(2);
		expect(lines.join("\n")).toMatch(/still holds Administrator/);
	});

	it("reports just the retry's error when it fails and the permission was taken away cleanly", async () => {
		let calls = 0;
		const ensureServer = vi.fn(async () => {
			if (calls++ === 0) throw needsIt();
			throw new Error("still refused");
		});
		const { run, lines } = setup(
			fakeNotifications({ layout: LAYOUT_S, ensureServer, holdsPermission: vi.fn(async () => false) }),
			{ pause: async () => {} }
		);
		const report = await run();
		expect(report.failures[0]?.message).toBe("still refused");
		expect(lines.join("\n")).toContain("Administrator is gone again");
		expect(lines.join("\n")).not.toMatch(/still holds|could not check/);
	});

	it("does not offer to grant what the bot already holds, so a lost-access refusal is shown as it is", async () => {
		const pause = vi.fn(async () => {});
		const { run } = setup(
			fakeNotifications({ layout: LAYOUT_S, ensureServer: flaky(), holdsPermission: vi.fn(async () => true) }),
			{ pause }
		);
		const report = await run();
		expect(report.failures[0]?.message).toBe("community was refused");
		expect(pause).not.toHaveBeenCalled();
	});

	it("fails the run when it could not build a link to take the permission away, or cannot check it", async () => {
		let calls = 0;
		const noRevoke = vi.fn(async () => {
			if (calls++ === 0)
				throw new ElevationRequiredError("refused", { permission: "Administrator", grantUrl: "https://g" });
			return { updated: ["community"] };
		});
		const a = await setup(fakeNotifications({ layout: LAYOUT_S, ensureServer: noRevoke }), {
			pause: async () => {},
		}).run();
		expect(a.failures[0]?.message).toMatch(/no link could be built to take Administrator away/);
		const b = await setup(
			fakeNotifications({
				layout: LAYOUT_S,
				ensureServer: flaky(),
				holdsPermission: vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("down")),
			}),
			{ pause: async () => {} }
		).run();
		expect(b.failures[0]?.message).toMatch(/could not check that Administrator is gone/);
	});

	it("keeps what the first attempt had already changed in the summary", async () => {
		let calls = 0;
		const ensureServer = vi.fn(async () => {
			if (calls++ === 0) {
				throw new ElevationRequiredError("refused", {
					permission: "Administrator",
					grantUrl: "https://g",
					applied: ["verification"],
				});
			}
			return { updated: ["community"] };
		});
		const { run, lines } = setup(fakeNotifications({ layout: LAYOUT_S, ensureServer }), { pause: async () => {} });
		await run();
		expect(lines.join("\n")).toContain("updated server settings: verification, community");
	});

	it("reports the explanation as it always did when nobody is there to answer, or no link could be built", async () => {
		const nobody = await setup(fakeNotifications({ layout: LAYOUT_S, ensureServer: flaky() }), {
			pause: false,
		}).run();
		expect(nobody.failures[0]?.message).toBe("community was refused");
		const noLink = vi.fn(async () => {
			throw new ElevationRequiredError("refused", { permission: "Administrator" });
		});
		const pause = vi.fn(async () => {});
		const report = await setup(fakeNotifications({ layout: LAYOUT_S, ensureServer: noLink }), { pause }).run();
		expect(report.failures[0]?.message).toBe("refused");
		expect(pause).not.toHaveBeenCalled();
	});
});

describe("Pin Messages for pinning", () => {
	const LAYOUT_P: NotificationsLayout = {
		categories: [{ name: "A", channels: [{ name: "welcome" }] }],
		pinned: [{ channel: "welcome", content: "Hello" }],
	};
	const refused = () =>
		new ElevationRequiredError("could not pin", {
			permission: "PinMessages",
			label: "Pin Messages",
			keep: true,
			grantUrl: "https://grant",
		});

	it("asks for it, retries, and takes nothing away afterwards", async () => {
		let calls = 0;
		const ensurePinned = vi.fn(async () => {
			if (calls++ === 0) throw refused();
			return { updated: ["#welcome"] };
		});
		const pause = vi.fn(async () => {});
		const holdsPermission = vi.fn(async () => false);
		const { run, lines } = setup(fakeNotifications({ layout: LAYOUT_P, ensurePinned, holdsPermission }), { pause });
		const report = await run();
		expect(report.failures).toEqual([]);
		expect(report.status).toBe("ok");
		expect(pause).toHaveBeenCalledTimes(1);
		const out = lines.join("\n");
		expect(out).toContain("pinned messages needs Pin Messages");
		expect(out).not.toContain("for this one edit");
		expect(out).not.toContain("take it away");
		expect(out).toContain("updated pinned messages: #welcome");
	});

	it("shows the plain explanation when nobody is there, or the bot already has it", async () => {
		const ensurePinned = vi.fn(async () => {
			throw refused();
		});
		const nobody = await setup(fakeNotifications({ layout: LAYOUT_P, ensurePinned }), { pause: false }).run();
		expect(nobody.failures[0]?.message).toBe("could not pin");
		// Only Pin Messages counts: holding the old Manage Messages must not stop the walkthrough.
		const holdsPermission = vi.fn(async (permission: string) => permission === "PinMessages");
		const holds = await setup(fakeNotifications({ layout: LAYOUT_P, ensurePinned, holdsPermission }), {
			pause: async () => {},
		}).run();
		expect(holds.failures[0]?.message).toBe("could not pin");
		expect(holdsPermission).toHaveBeenCalledWith("PinMessages");
		expect(holdsPermission).not.toHaveBeenCalledWith("ManageMessages");
	});

	it("walks through it when only the old Manage Messages is held", async () => {
		let calls = 0;
		const ensurePinned = vi.fn(async () => {
			if (calls++ === 0) throw refused();
			return { updated: ["#welcome"] };
		});
		const pause = vi.fn(async () => {});
		const holdsPermission = vi.fn(async (permission: string) => permission === "ManageMessages");
		const { run } = setup(fakeNotifications({ layout: LAYOUT_P, ensurePinned, holdsPermission }), { pause });
		expect((await run()).status).toBe("ok");
		expect(pause).toHaveBeenCalledTimes(1);
		expect(holdsPermission).toHaveBeenCalledWith("PinMessages");
	});
});

describe("monitoring feeds", () => {
	const FED: NotificationsLayout = {
		categories: [{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: true } }] }],
	};
	const monitoring = () => ({
		ensureCheck: vi.fn(),
		ensureAlertChannel: vi.fn(async () => ({ created: true, updated: [], subscribed: 2 })),
	});

	it("hands the channel a dedicated webhook named after the provider, as an alert channel named after the channel", async () => {
		const m = monitoring();
		const n = fakeNotifications({
			layout: FED,
			ensureWebhook: vi.fn(async () => ({ created: true, url: "https://hook/x" })),
		});
		const { run, stored } = setup(n, { monitoring: m });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(n.ensureWebhook).toHaveBeenCalledWith(expect.objectContaining({ channel: "uptime", name: "Checkly" }));
		expect(m.ensureAlertChannel).toHaveBeenCalledWith({
			name: "Discord #uptime",
			format: "discord",
			url: "https://hook/x",
		});
		expect(report.channels[0]?.alertChannel).toMatchObject({
			name: "Discord #uptime",
			created: true,
			subscribed: 2,
		});
		// The URL went to Checkly only: no secret holds it.
		expect(stored).toEqual([]);
	});

	it("takes the names from the layout when it gives them", async () => {
		const m = monitoring();
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [{ name: "uptime", feeds: { monitoring: { name: "Uptime", webhook: "Probe" } } }],
				},
			],
		};
		const n = fakeNotifications({ layout });
		await setup(n, { monitoring: m }).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith(expect.objectContaining({ name: "Probe" }));
		expect(m.ensureAlertChannel).toHaveBeenCalledWith(expect.objectContaining({ name: "Uptime" }));
	});

	it("refuses, before changing anything, when no monitoring provider is configured", async () => {
		const n = fakeNotifications({ layout: FED });
		const report = await setup(n).run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/fed by monitoring, which needs a `monitoring` capability/);
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("previews in a dry run without calling the monitoring provider", async () => {
		const m = monitoring();
		const n = fakeNotifications({ layout: FED });
		const { run, lines } = setup(n, { monitoring: m, dryRun: true });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(m.ensureAlertChannel).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain(
			"would ensure webhook Checkly and alert channel Discord #uptime (monitoring)"
		);
	});

	it("reports a failed alert channel and goes on", async () => {
		const m = {
			...monitoring(),
			ensureAlertChannel: vi.fn(async () => {
				throw new Error("Checkly said no");
			}),
		};
		const n = fakeNotifications({ layout: FED });
		const report = await setup(n, { monitoring: m }).run();
		expect(report.status).toBe("fail");
		expect(report.failures.map((f) => f.message).join(" ")).toContain("Checkly said no");
	});
});
