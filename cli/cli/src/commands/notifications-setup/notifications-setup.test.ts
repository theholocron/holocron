import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NonInteractiveError } from "@theholocron/kyber/ui";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Monitoring, Notifications, NotificationsLayout } from "../../plugin/index.js";
import { ElevationRequiredError, type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { PREFLIGHT_PREFIX } from "../notifications-channel-add/index.js";
import { feedProblem, forumLayoutProblem, PR_FEED_TAGS, runNotificationsSetup } from "./notifications-setup.js";

const confirmPrompt = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", async (importOriginal) => ({
	...(await importOriginal<typeof import("@inquirer/prompts")>()),
	confirm: confirmPrompt,
}));

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
	readers: ["theholocron/holocron"],
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
		// A layout a test gives gets the readers unless it says its own (an empty list is "none").
		...(over.layout && !("readers" in over.layout) ? { layout: { ...over.layout, readers: LAYOUT.readers } } : {}),
	} as Notifications;
}

function setup(
	notifications: Notifications,
	opts: {
		secrets?: boolean;
		dryRun?: boolean;
		org?: string;
		monitoring?: Partial<Monitoring>;
		/** The relay's three collaborators; each can be left out to see the refusal. */
		relay?: {
			errors?: boolean | object;
			workers?: unknown;
			dns?: unknown;
			readCode?: (path: string) => Promise<string>;
		};
		/** A vendor's provider for a relay source: the capability it holds and what it implements. */
		vendor?: { capability: "deployment" | "auth"; provider: string; impl: object };
		repoRoot?: string;
		loadAvatar?: (source: string) => Promise<string>;
		loadEmojiImage?: (source: string) => Promise<string>;
		pause?: ((message: string) => Promise<void>) | false;
		yes?: boolean;
		interactive?: boolean;
		confirm?: (message: string) => Promise<boolean>;
	} = {}
) {
	const loaded = loadedFrom({
		name: "demo",
		providers: {
			notifications: ["discord"],
			...(opts.secrets === false ? {} : { secrets: "github" }),
			...(opts.monitoring ? { monitoring: "checkly" } : {}),
			...(opts.relay?.errors ? { errors: "sentry" } : {}),
			...(opts.relay?.workers ? { workers: "cloudflare" } : {}),
			...(opts.relay?.dns ? { dns: "cloudflare" } : {}),
			...(opts.vendor ? { [opts.vendor.capability]: opts.vendor.provider } : {}),
		},
	});
	const stored: Array<{ name: string; value: string }> = [];
	const scopes: unknown[] = [];
	const loader = makeLoader(loaded, {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		...(opts.monitoring
			? {
					"@theholocron/holocron-plugin-checkly": makePlugin("checkly", {
						monitoring: { key: "monitoring", providerName: "checkly", checks: [], ...opts.monitoring },
					}),
				}
			: {}),
		...(opts.relay?.errors
			? {
					"@theholocron/holocron-plugin-sentry": makePlugin("sentry", {
						errors: {
							key: "errors",
							providerName: "sentry",
							...(typeof opts.relay.errors === "object" ? opts.relay.errors : {}),
						},
					}),
				}
			: {}),
		...(opts.relay?.workers || opts.relay?.dns
			? {
					"@theholocron/holocron-plugin-cloudflare": makePlugin("cloudflare", {
						...(opts.relay.workers ? { workers: opts.relay.workers } : {}),
						...(opts.relay.dns ? { dns: opts.relay.dns } : {}),
					}),
				}
			: {}),
		...(opts.vendor
			? {
					[`@theholocron/holocron-plugin-${opts.vendor.provider}`]: makePlugin(opts.vendor.provider, {
						[opts.vendor.capability]: {
							key: opts.vendor.capability,
							providerName: opts.vendor.provider,
							...opts.vendor.impl,
						},
					}),
				}
			: {}),
		"@theholocron/holocron-plugin-github": makePlugin("gh", {
			secrets: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async (scope: unknown, name: string, value: string) => {
					scopes.push(scope);
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
		scopes,
		lines,
		log,
		run: () =>
			runNotificationsSetup({
				loaded,
				context: {
					repoRoot: opts.repoRoot ?? "/tmp/test",
					...("org" in opts ? (opts.org ? { org: opts.org } : {}) : { org: "theholocron" }),
					...(opts.dryRun ? { dryRun: true } : {}),
				},
				loader,
				...(opts.loadAvatar ? { loadAvatar: opts.loadAvatar } : {}),
				...(opts.loadEmojiImage ? { loadEmojiImage: opts.loadEmojiImage } : {}),
				...(opts.relay?.readCode ? { readRelayCode: opts.relay.readCode } : {}),
				...(opts.pause ? { pause: opts.pause } : {}),
				...(opts.yes ? { yes: true } : {}),
				...(opts.interactive !== undefined ? { interactive: opts.interactive } : {}),
				...(opts.confirm ? { confirm: opts.confirm } : {}),
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
			expect(preflight).toHaveBeenCalledWith(expect.objectContaining(SERVER_LAYOUT));
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

	it("writes every secret, the preflight probe and the role ids too, for the layout's readers only (#2131)", async () => {
		const { run, scopes, stored } = setup(fakeNotifications());
		expect((await run()).status).toBe("ok");
		expect(stored).toHaveLength(2);
		expect(scopes.length).toBeGreaterThan(2);
		for (const scope of scopes) {
			expect(scope).toEqual({
				kind: "organization",
				name: "theholocron",
				visibility: "selected",
				repos: ["holocron"],
			});
		}
	});

	it("refuses, creating and storing nothing, when the layout names no readers", async () => {
		const n = fakeNotifications({ layout: { ...LAYOUT, readers: [] } });
		const { run, scopes } = setup(n);
		expect(await run()).toMatchObject({ status: "fail", message: expect.stringMatching(/`readers`/) });
		expect(n.ensureCategory).not.toHaveBeenCalled();
		expect(scopes).toEqual([]);
	});

	it("refuses a reader outside the organization", async () => {
		const n = fakeNotifications({ layout: { ...LAYOUT, readers: ["other/repo"] } });
		expect(await setup(n).run()).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/must be repositories of theholocron.*other\/repo/),
		});
	});

	it("needs no readers on --dry-run, which stores nothing, or for a layout that stores no secret", async () => {
		const dry = await setup(fakeNotifications({ layout: { ...LAYOUT, readers: [] } }), { dryRun: true }).run();
		expect(dry.status).toBe("dry-run");
		const plain: NotificationsLayout = { categories: [{ name: "BUILD", channels: [{ name: "dev" }] }] };
		expect((await setup(fakeNotifications({ layout: plain })).run()).status).toBe("ok");
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
		expect(log).not.toHaveBeenCalledWith(expect.stringContaining("setup notifications"));
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

	it("falls back to the image of the layout's { url, image } picture, and says it did", async () => {
		const n = fakeNotifications({
			layout: withAvatar({ webhookAvatar: { url: "https://cdn.example.com/a.png", image: "media/a.png" } }),
		});
		const { run, lines } = setup(n, {
			loadAvatar: async (source) => {
				if (source.startsWith("https://")) throw new Error("fetch failed");
				return "data:image/png;base64,LOCAL";
			},
		});
		const report = await run();
		expect(report.status).toBe("ok");
		expect(n.ensureWebhook).toHaveBeenCalledTimes(2);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "alerts", avatar: "data:image/png;base64,LOCAL" })
		);
		expect(lines.join("\n")).toContain(
			"avatar https://cdn.example.com/a.png could not be read (fetch failed); trying the next"
		);
	});

	it("uses the url of a { url, image } picture when it can be read", async () => {
		const load = vi.fn(async (source: string) => `data:image/png;base64,${source}`);
		const n = fakeNotifications({
			layout: withAvatar({ webhookAvatar: { url: "https://cdn.example.com/a.png", image: "media/a.png" } }),
		});
		await setup(n, { loadAvatar: load }).run();
		expect(load).toHaveBeenCalledTimes(1);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ avatar: "data:image/png;base64,https://cdn.example.com/a.png" })
		);
	});

	it("lets a webhook name a { url, image } picture of its own, keeping its name and secret", async () => {
		const n = fakeNotifications({
			layout: withAvatar({
				categories: [
					{
						name: "A",
						channels: [
							{
								name: "x",
								webhook: {
									name: "Hook",
									secret: "X_HOOK",
									avatar: { url: "https://cdn.example.com/own.png", image: "own.png" },
								},
							},
						],
					},
				],
			}),
		});
		await setup(n, {
			loadAvatar: async (source) => {
				if (source.startsWith("https://")) throw new Error("fetch failed");
				return `data:image/png;base64,${source}`;
			},
		}).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "x", name: "Hook", avatar: "data:image/png;base64,own.png" })
		);
	});

	it("names every source when none of a webhook's { url, image } can be read", async () => {
		const n = fakeNotifications({
			layout: withAvatar({ webhookAvatar: { url: "https://cdn.example.com/a.png", image: "media/a.png" } }),
		});
		const report = await setup(n, {
			loadAvatar: async (source) => {
				throw new Error(source.startsWith("https://") ? "fetch failed" : "ENOENT");
			},
		}).run();
		expect(report.status).toBe("fail");
		expect(report.message).toBe(
			"webhook avatar `https://cdn.example.com/a.png`: fetch failed; `media/a.png`: ENOENT"
		);
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("refuses a webhook picture that is empty, whose url is not https, or whose image is a URL", async () => {
		const own = (avatar: unknown): NotificationsLayout =>
			withAvatar({
				webhookAvatar: undefined,
				categories: [{ name: "A", channels: [{ name: "x", webhook: { avatar } } as never] }],
			});
		const message = async (layout: NotificationsLayout) => {
			const n = fakeNotifications({ layout });
			const report = await setup(n).run();
			expect(n.ensureChannel).not.toHaveBeenCalled();
			return report.message;
		};
		expect(await message(own({}))).toBe("channel `x`: `webhook.avatar` needs a `url`, an `image`, or both");
		expect(await message(own({ url: "http://cdn.example.com/a.png" }))).toBe(
			"channel `x`: `webhook.avatar.url` must be an https:// URL"
		);
		expect(await message(withAvatar({ webhookAvatar: { image: "https://cdn.example.com/a.png" } }))).toBe(
			"`webhookAvatar.image` must be a file in the repo, not a URL"
		);
		expect(await message(withAvatar({ webhookAvatar: { image: "data:image/png;base64,iVBORw0KGgo=" } }))).toBe(
			"`webhookAvatar.image` must be a file in the repo, not a URL"
		);
		// a null a config wrote is a refusal, not a TypeError
		expect(await message(own(null))).toBe(
			"channel `x`: `webhook.avatar` must be a path or an https:// URL, or `{ url, image }`"
		);
		expect(await message(withAvatar({ webhookAvatar: null as never }))).toBe(
			"`webhookAvatar` must be a path or an https:// URL, or `{ url, image }`"
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

	describe("from a file in the repository", () => {
		const FILE_LAYOUT = (pinned: NotificationsLayout["pinned"]): NotificationsLayout => ({
			categories: [{ name: "A", channels: [{ name: "rules" }] }],
			pinned,
		});

		it("hands the provider the file's text, and the file's name with it", async () => {
			const root = await mkdtemp(join(tmpdir(), "setup-pinned-"));
			await writeFile(join(root, "RULES.md"), "**Rules**\r\nBe kind.\r\n\r\n");
			const ensurePinned = vi.fn(async () => ({ updated: ["#rules"] }));
			const n = fakeNotifications({
				layout: FILE_LAYOUT([{ channel: "rules", file: "RULES.md" }]),
				ensurePinned,
			});

			const report = await setup(n, { repoRoot: root }).run();

			expect(report.status).toBe("ok");
			expect(ensurePinned).toHaveBeenCalledWith([
				{ channel: "rules", file: "RULES.md", content: "**Rules**\nBe kind." },
			]);
		});

		it("stops before anything is created when the file cannot be read", async () => {
			const root = await mkdtemp(join(tmpdir(), "setup-pinned-"));
			const n = fakeNotifications({
				layout: FILE_LAYOUT([{ channel: "rules", file: "RULES.md" }]),
				ensurePinned: vi.fn(),
			});

			const report = await setup(n, { repoRoot: root }).run();

			expect(report.status).toBe("fail");
			expect(report.message).toBe("pinned: `RULES.md` (for #rules) could not be read: it does not exist");
			expect(n.ensureCategory).not.toHaveBeenCalled();
		});

		it("refuses a message that gives both content and file, or neither", async () => {
			const both = await setup(
				fakeNotifications({
					layout: FILE_LAYOUT([{ channel: "rules", content: "x", file: "RULES.md" }]),
					ensurePinned: vi.fn(),
				})
			).run();
			const neither = await setup(
				fakeNotifications({ layout: FILE_LAYOUT([{ channel: "rules" }]), ensurePinned: vi.fn() })
			).run();

			expect(both.message).toMatch(/sets both `content` and `file`/);
			expect(neither.message).toMatch(/message for `rules` has no text; give it `content` or a `file`/);
		});

		it("refuses a file that is empty once read", async () => {
			const root = await mkdtemp(join(tmpdir(), "setup-pinned-"));
			await writeFile(join(root, "RULES.md"), "\n\n");

			const report = await setup(
				fakeNotifications({
					layout: FILE_LAYOUT([{ channel: "rules", file: "RULES.md" }]),
					ensurePinned: vi.fn(),
				}),
				{ repoRoot: root }
			).run();

			expect(report.message).toMatch(/message for `rules` is empty/);
		});
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
			name: "Message to #uptime",
			format: "discord",
			url: "https://hook/x",
		});
		expect(report.channels[0]?.alertChannel).toMatchObject({
			name: "Message to #uptime",
			created: true,
			subscribed: 2,
		});
		// The URL went to Checkly only: no secret holds it.
		expect(stored).toEqual([]);
	});

	it("reads the feed's avatar, gives it to the webhook, and refuses before changing anything when it cannot be read", async () => {
		const AVATAR = "https://example.com/checkly.png";
		const layout: NotificationsLayout = {
			categories: [{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: { avatar: AVATAR } } }] }],
		};
		const n = fakeNotifications({ layout });
		const loaded: string[] = [];
		await setup(n, {
			monitoring: monitoring(),
			loadAvatar: async (source) => (loaded.push(source), "data:image/png;base64,AA"),
		}).run();
		expect(loaded).toEqual([AVATAR]);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Checkly", avatar: "data:image/png;base64,AA" })
		);

		const bad = fakeNotifications({ layout });
		const report = await setup(bad, {
			monitoring: monitoring(),
			loadAvatar: async () => {
				throw new Error("it is not a PNG");
			},
		}).run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain(`webhook avatar \`${AVATAR}\`: it is not a PNG`);
		expect(bad.ensureChannel).not.toHaveBeenCalled();
	});

	it("falls back to the layout's webhook picture for a feed, and an explicit one wins", async () => {
		const layout: NotificationsLayout = {
			webhookAvatar: "media/all.png",
			categories: [
				{
					name: "ALERTS",
					channels: [
						{ name: "uptime", feeds: { monitoring: true } },
						{
							name: "errors",
							feeds: { monitoring: { name: "Errors", webhook: "Probe", avatar: "media/own.png" } },
						},
					],
				},
			],
		};
		const n = fakeNotifications({ layout });
		const m = { ...monitoring(), providerName: "checkly" };
		await setup(n, {
			monitoring: m,
			loadAvatar: async (source) => `data:image/png;base64,${source}`,
		}).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "uptime", avatar: "data:image/png;base64,media/all.png" })
		);
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ channel: "errors", avatar: "data:image/png;base64,media/own.png" })
		);
	});

	it("uses the monitoring provider's own icon when the config names no picture, URL first and its embedded image after", async () => {
		const layout: NotificationsLayout = {
			webhookAvatar: "media/all.png",
			categories: [{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: true } }] }],
		};
		const icon = { url: "https://cdn.example.com/icon.png", dataUri: "data:image/png;base64,EMBEDDED" };
		const n = fakeNotifications({ layout });
		const { run, lines } = setup(n, {
			monitoring: { ...monitoring(), icon },
			loadAvatar: async (source) => {
				if (source.startsWith("https://")) throw new Error("fetch failed");
				return source;
			},
		});
		await run();
		// Not the layout's picture: the provider's icon comes first, and the embedded copy backs up the URL.
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Checkly", avatar: "data:image/png;base64,EMBEDDED" })
		);
		expect(lines.join("\n")).toContain(
			"avatar https://cdn.example.com/icon.png could not be read (fetch failed); trying the next"
		);
	});

	it("lets the config's own picture win over the provider's icon", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: { avatar: "media/own.png" } } }] },
			],
		};
		const n = fakeNotifications({ layout });
		const read = vi.fn(async (source: string) => `uri:${source}`);
		await setup(n, {
			monitoring: { ...monitoring(), icon: { url: "https://cdn.example.com/icon.png" } },
			loadAvatar: read,
		}).run();
		expect(read).toHaveBeenCalledTimes(1);
		expect(read).toHaveBeenCalledWith("media/own.png");
		expect(n.ensureWebhook).toHaveBeenCalledWith(expect.objectContaining({ avatar: "uri:media/own.png" }));
	});

	it("falls back to the next source of a feed's picture, and says it did", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [
						{
							name: "uptime",
							feeds: {
								monitoring: { avatar: { url: "https://cdn.example.com/a.png", image: "media/a.png" } },
							},
						},
					],
				},
			],
		};
		const n = fakeNotifications({ layout });
		const { run, lines } = setup(n, {
			monitoring: monitoring(),
			loadAvatar: async (source) => {
				if (source.startsWith("https://")) throw new Error("fetch failed");
				return "data:image/png;base64,LOCAL";
			},
		});
		const report = await run();
		expect(report.status).toBe("ok");
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Checkly", avatar: "data:image/png;base64,LOCAL" })
		);
		expect(lines.join("\n")).toContain(
			"avatar https://cdn.example.com/a.png could not be read (fetch failed); trying the next"
		);
	});

	it("reads a relative avatar path from the repository root, not from wherever the command runs", async () => {
		const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const root = await mkdtemp(join(tmpdir(), "repo-"));
		await mkdir(join(root, "media"));
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
		await writeFile(join(root, "media", "own.png"), png);
		const layout: NotificationsLayout = {
			categories: [
				{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: { avatar: "media/own.png" } } }] },
			],
		};
		const n = fakeNotifications({ layout });
		const report = await setup(n, { monitoring: monitoring(), repoRoot: root }).run();
		expect(report.status).toBe("ok");
		expect(n.ensureWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ avatar: `data:image/png;base64,${png.toString("base64")}` })
		);
	});

	it("uses a single feed picture that cannot be read as before: the run is refused, naming it", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [{ name: "uptime", feeds: { monitoring: { avatar: { image: "media/gone.png" } } } }],
				},
			],
		};
		const n = fakeNotifications({ layout });
		const { run, lines } = setup(n, {
			monitoring: monitoring(),
			loadAvatar: async () => {
				throw new Error("ENOENT");
			},
		});
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toBe("webhook avatar `media/gone.png`: ENOENT");
		expect(lines.join("\n")).not.toContain("trying the next");
		for (const created of [n.ensureCategory, n.ensureChannel, n.ensureWebhook, n.ensureRole]) {
			expect(created).not.toHaveBeenCalled();
		}
	});

	it("refuses naming every source when none of a feed's pictures can be read", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [
						{
							name: "uptime",
							feeds: {
								monitoring: { avatar: { url: "https://cdn.example.com/a.png", image: "media/a.png" } },
							},
						},
					],
				},
			],
		};
		const n = fakeNotifications({ layout });
		const { run, lines } = setup(n, {
			monitoring: monitoring(),
			loadAvatar: async (source) => {
				throw new Error(source.startsWith("https") ? "fetch failed" : "ENOENT");
			},
		});
		const report = await run();
		// Only the first skip has another source to move on to.
		expect(lines.filter((l) => l.includes("trying the next"))).toHaveLength(1);
		expect(report.message).toBe(
			"webhook avatar `https://cdn.example.com/a.png`: fetch failed; `media/a.png`: ENOENT"
		);
		for (const created of [n.ensureCategory, n.ensureChannel, n.ensureWebhook, n.ensureRole]) {
			expect(created).not.toHaveBeenCalled();
		}
	});

	it("does not print the query or credentials of an avatar URL it could not read", async () => {
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [
						{
							name: "uptime",
							feeds: { monitoring: { avatar: "https://u:p@cdn.example.com/a.png?sig=SECRET" } },
						},
					],
				},
			],
		};
		const n = fakeNotifications({ layout });
		const report = await setup(n, {
			monitoring: monitoring(),
			loadAvatar: async () => {
				throw new Error("fetching it answered 403");
			},
		}).run();
		expect(report.message).toBe("webhook avatar `https://cdn.example.com/a.png`: fetching it answered 403");
		expect(report.message).not.toContain("SECRET");
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

	it("hands the alert settings a feed declares to the alert channel", async () => {
		const m = {
			providerName: "checkly",
			checks: [],
			ensureAlertChannel: vi.fn(async () => ({ created: true, updated: [], subscribed: 0 })),
		};
		const layout: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [
						{ name: "uptime", feeds: { monitoring: { alerts: { recovery: false, sslExpiry: true } } } },
					],
				},
			],
		};
		const n = fakeNotifications({ layout });
		await setup(n, { monitoring: m }).run();
		expect(m.ensureAlertChannel).toHaveBeenCalledWith(
			expect.objectContaining({ alerts: { recovery: false, sslExpiry: true } })
		);
	});

	it("refuses, before changing anything, when no monitoring provider is configured", async () => {
		const n = fakeNotifications({ layout: FED });
		const report = await setup(n).run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/fed by monitoring, which needs a `monitoring` capability/);
		expect(n.ensureCategory).not.toHaveBeenCalled();
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("refuses a check routed to an alert channel when no channel is fed by monitoring", async () => {
		const m = {
			providerName: "checkly",
			checks: [{ name: "c", url: "u", alertChannels: ["Message to #uptime"] }],
			ensureAlertChannel: vi.fn(),
		};
		const plain: NotificationsLayout = { categories: [{ name: "A", channels: [{ name: "plain" }] }] };
		const n = fakeNotifications({ layout: plain });
		const report = await setup(n, { monitoring: m }).run();
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/check `c` is routed to the alert channel Message to #uptime/);
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("goes on when a monitoring provider is configured, no channel is fed by it and no check is routed", async () => {
		const m = { providerName: "checkly", checks: [{ name: "c", url: "u" }], ensureAlertChannel: vi.fn() };
		const plain: NotificationsLayout = { categories: [{ name: "A", channels: [{ name: "plain" }] }] };
		const n = fakeNotifications({ layout: plain });
		const report = await setup(n, { monitoring: m }).run();
		expect(report.status).toBe("ok");
		expect(m.ensureAlertChannel).not.toHaveBeenCalled();
	});

	it("previews in a dry run without calling the monitoring provider", async () => {
		const m = monitoring();
		const n = fakeNotifications({ layout: FED });
		const { run, lines } = setup(n, { monitoring: m, dryRun: true });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(m.ensureAlertChannel).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain(
			"would ensure webhook Checkly and alert channel Message to #uptime (monitoring)"
		);
	});

	it("reports a failed alert channel and goes on to the channels after it", async () => {
		const m = {
			...monitoring(),
			ensureAlertChannel: vi.fn(async () => {
				throw new Error("Checkly said no");
			}),
		};
		const layout: NotificationsLayout = {
			categories: [
				{ name: "ALERTS", channels: [{ name: "uptime", feeds: { monitoring: true } }, { name: "errors" }] },
			],
		};
		const n = fakeNotifications({ layout });
		const report = await setup(n, { monitoring: m }).run();
		expect(report.status).toBe("fail");
		expect(report.failures.map((f) => f.message).join(" ")).toContain("Checkly said no");
		expect(n.ensureChannel).toHaveBeenCalledWith(expect.objectContaining({ name: "errors" }));
		expect(report.channels.map((c) => c.name)).toContain("errors");
	});

	it("accepts a feed picture given as one source, as a url, as an image, or as both", () => {
		const ok = { providerName: "checkly", ensureAlertChannel: vi.fn() };
		const feedWith = (avatar: unknown): NotificationsLayout => ({
			categories: [{ name: "A", channels: [{ name: "uptime", feeds: { monitoring: { avatar } } } as never] }],
		});
		for (const avatar of [
			"media/a.png",
			{ url: "https://cdn.example.com/a.png" },
			{ image: "media/a.png" },
			{ url: "https://cdn.example.com/a.png", image: "media/a.png" },
		]) {
			expect(feedProblem(feedWith(avatar), ok)).toBeUndefined();
		}
	});

	it("refuses a feed picture that is empty, whose url is not https, or whose image is a URL", () => {
		const ok = { providerName: "checkly", ensureAlertChannel: vi.fn() };
		const feedWith = (avatar: unknown): NotificationsLayout => ({
			categories: [{ name: "A", channels: [{ name: "uptime", feeds: { monitoring: { avatar } } } as never] }],
		});
		expect(feedProblem(feedWith({}), ok)).toMatch(/needs a `url`, an `image`, or both/);
		expect(feedProblem(feedWith({ url: "http://cdn.example.com/a.png" }), ok)).toMatch(
			/avatar\.url` must be an https:\/\/ URL/
		);
		expect(feedProblem(feedWith({ url: "media/a.png" }), ok)).toMatch(/avatar\.url` must be an https/);
		expect(feedProblem(feedWith({ image: "https://cdn.example.com/a.png" }), ok)).toMatch(
			/avatar\.image` must be a file in the repo, not a URL/
		);
	});

	it("refuses a check routed to an alert channel that no feed declares, and accepts one that does", () => {
		const layout: NotificationsLayout = {
			categories: [{ name: "A", channels: [{ name: "uptime", feeds: { monitoring: true } }] }],
		};
		const provider = (checks: { name: string; url: string; alertChannels?: string[] }[]) => ({
			providerName: "checkly",
			ensureAlertChannel: vi.fn(),
			checks,
		});
		expect(
			feedProblem(layout, provider([{ name: "c", url: "u", alertChannels: ["Message to #nowhere"] }]))
		).toMatch(/check `c` is routed to the alert channel Message to #nowhere, which no `feeds.monitoring` declares/);
		expect(
			feedProblem(
				layout,
				provider([
					{ name: "c", url: "u", alertChannels: ["message to #uptime"] },
					{ name: "d", url: "u" },
				])
			)
		).toBeUndefined();
	});

	it("has no feed problem for a layout with no categories, or categories with no channels", () => {
		const ok = { providerName: "checkly", ensureAlertChannel: vi.fn() };
		expect(feedProblem({}, ok)).toBeUndefined();
		expect(feedProblem({ categories: [{ name: "EMPTY" }] }, ok)).toBeUndefined();
	});

	it("refuses a bad feed before creating anything: a provider that cannot manage alert channels, or a name used twice", async () => {
		const bare = { ensureCheck: vi.fn() };
		const n = fakeNotifications({ layout: FED });
		const noMethod = await setup(n, { monitoring: bare }).run();
		expect(noMethod.message).toMatch(/cannot manage alert channels/);

		const twice: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [
						{ name: "errors" },
						{ name: "uptime", feeds: { monitoring: { name: "Shared" } } },
						{ name: "alerts", feeds: { monitoring: { name: "SHARED" } } },
					],
				},
			],
		};
		const n2 = fakeNotifications({ layout: twice });
		const dup = await setup(n2, { monitoring: monitoring() }).run();
		expect(dup.status).toBe("fail");
		expect(dup.message).toMatch(/channels `uptime` and `alerts` would both use the alert channel SHARED/);

		const clash: NotificationsLayout = {
			categories: [
				{
					name: "ALERTS",
					channels: [{ name: "uptime", webhook: { name: "checkly" }, feeds: { monitoring: true } }],
				},
			],
		};
		const n3 = fakeNotifications({ layout: clash });
		const same = await setup(n3, { monitoring: monitoring() }).run();
		expect(same.message).toMatch(/both named checkly/);
		for (const notifier of [n, n2, n3]) {
			expect(notifier.ensureCategory).not.toHaveBeenCalled();
			expect(notifier.ensureChannel).not.toHaveBeenCalled();
		}
	});
});

describe("the relay Worker", () => {
	const HOOK = "https://discord.com/api/webhooks/9/relay-secret-token";
	const layout = (over: Partial<NotificationsLayout> = {}): NotificationsLayout => ({
		relay: { host: "comlink.example.dev" },
		categories: [{ name: "ALERTS", channels: [{ name: "errors", feeds: { errors: true } }] }],
		...over,
	});
	const collaborators = () => ({
		errors: true,
		workers: {
			key: "workers",
			providerName: "cloudflare",
			deployScript: vi.fn(async (name: string) => ({ scriptName: name })),
		},
		dns: { key: "dns", providerName: "cloudflare", upsertRecord: vi.fn(async (_z: string, r: unknown) => r) },
		readCode: vi.fn(async () => "export default {}"),
	});
	const hooked = (over: Partial<Notifications> = {}) =>
		fakeNotifications({
			layout: layout(),
			ensureWebhook: vi.fn(async () => ({ created: true, url: HOOK })),
			...over,
		});

	it("makes a webhook named for the tracker, then deploys the Worker with that URL as its secret and a route", async () => {
		const relay = collaborators();
		const n = hooked();
		const { run, lines, stored } = setup(n, { relay });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(n.ensureWebhook).toHaveBeenCalledWith({ channel: "errors", name: "Sentry", category: "ALERTS" });
		expect(relay.dns.upsertRecord).toHaveBeenCalledWith("comlink.example.dev", {
			type: "AAAA",
			name: "comlink.example.dev",
			content: "100::",
			ttl: 1,
			proxied: true,
		});
		expect(relay.workers.deployScript).toHaveBeenCalledWith("comlink", {
			code: "export default {}",
			secrets: { COMLINK_SENTRY_WEBHOOK: HOOK },
			routes: ["comlink.example.dev/*"],
		});
		expect(relay.readCode).toHaveBeenCalledWith("/tmp/test/apps/comlink/dist/worker.js");
		expect(lines.join("\n")).toContain("deployed comlink at comlink.example.dev");
		// The URL is a credential: not printed, not reported, not stored as a secret.
		expect(lines.join("\n")).not.toContain("relay-secret-token");
		expect(JSON.stringify(report)).not.toContain("relay-secret-token");
		expect(stored).toEqual([]);
	});

	it("honours the layout's zone, script name, code path and the feed's webhook name", async () => {
		const relay = collaborators();
		const n = hooked({
			layout: layout({
				relay: { host: "r.a.example.dev", zone: "a.example.dev", script: "hub", code: "dist/hub.js" },
				categories: [{ name: "A", channels: [{ name: "errors", feeds: { errors: { webhook: "Tracker" } } }] }],
			}),
		});
		await setup(n, { relay }).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith(expect.objectContaining({ name: "Tracker" }));
		expect(relay.dns.upsertRecord).toHaveBeenCalledWith(
			"a.example.dev",
			expect.objectContaining({ name: "r.a.example.dev" })
		);
		expect(relay.workers.deployScript).toHaveBeenCalledWith(
			"hub",
			expect.objectContaining({ routes: ["r.a.example.dev/*"] })
		);
		expect(relay.readCode).toHaveBeenCalledWith("/tmp/test/dist/hub.js");
	});

	it("gives the webhook the layout's picture", async () => {
		const relay = collaborators();
		const n = hooked({ layout: layout({ webhookAvatar: "media/a.png" }) });
		await setup(n, { relay, loadAvatar: async () => "data:image/png;base64,AAAA" }).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith(expect.objectContaining({ avatar: "data:image/png;base64,AAAA" }));
	});

	it("previews without making a webhook or touching DNS or the Worker", async () => {
		const relay = collaborators();
		const n = hooked();
		const { run, lines } = setup(n, { relay, dryRun: true });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(n.ensureWebhook).not.toHaveBeenCalled();
		expect(relay.dns.upsertRecord).not.toHaveBeenCalled();
		expect(relay.workers.deployScript).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("would ensure webhook Sentry for the relay Worker (errors)");
		expect(lines.join("\n")).toContain("would deploy the relay Worker at comlink.example.dev");
	});

	it("reads the built Worker from the repo when no reader is given", async () => {
		const root = await mkdtemp(join(tmpdir(), "relay-setup-"));
		await mkdir(join(root, "apps/comlink/dist"), { recursive: true });
		await writeFile(join(root, "apps/comlink/dist/worker.js"), "export default { real: true }");
		const relay = collaborators();
		const { readCode: _unused, ...withoutReader } = relay;
		const report = await setup(hooked(), { relay: withoutReader, repoRoot: root }).run();
		expect(report.status).toBe("ok");
		expect(relay.workers.deployScript).toHaveBeenCalledWith(
			"comlink",
			expect.objectContaining({ code: "export default { real: true }" })
		);
	});

	it("fails, before touching DNS, when the Worker has not been built", async () => {
		const relay = {
			...collaborators(),
			readCode: vi.fn(async () => {
				throw new Error("ENOENT");
			}),
		};
		const { run } = setup(hooked(), { relay });
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]!.message).toMatch(/relay Worker is not built/);
		expect(relay.dns.upsertRecord).not.toHaveBeenCalled();
		expect(relay.workers.deployScript).not.toHaveBeenCalled();
	});

	it("reports a webhook whose URL cannot be read back, and deploys nothing", async () => {
		const relay = collaborators();
		const n = hooked({ ensureWebhook: vi.fn(async () => ({ created: false })) });
		const report = await setup(n, { relay }).run();
		expect(report.status).toBe("fail");
		expect(report.failures.map((f) => f.message).join()).toMatch(/URL cannot be read back/);
		expect(relay.workers.deployScript).not.toHaveBeenCalled();
	});

	it("refuses when a collaborator is missing, naming what to add", async () => {
		for (const [leave, pattern] of [
			["errors", /`errors` provider/],
			["workers", /`workers` provider/],
			["dns", /`dns` provider/],
		] as const) {
			const relay = { ...collaborators(), [leave]: leave === "errors" ? false : undefined };
			const report = await setup(hooked(), { relay }).run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(pattern);
		}
	});

	it("refuses a layout with no relay host, with two fed channels, or whose webhook shares the channel's", async () => {
		const run = async (l: NotificationsLayout) =>
			(await setup(hooked({ layout: l }), { relay: collaborators() }).run()).message;
		expect(await run(layout({ relay: undefined }))).toMatch(/needs `relay.host`/);
		expect(
			await run(
				layout({
					categories: [
						{
							name: "A",
							channels: [
								{ name: "one", feeds: { errors: true } },
								{ name: "two", feeds: { errors: true } },
							],
						},
					],
				})
			)
		).toMatch(/relay posts to one channel/);
		expect(
			await run(
				layout({
					categories: [
						{
							name: "A",
							channels: [{ name: "errors", webhook: { name: "sentry" }, feeds: { errors: true } }],
						},
					],
				})
			)
		).toMatch(/both named sentry/);
	});

	it("asks nothing of the relay when no channel is fed by the tracker", async () => {
		const n = fakeNotifications();
		const report = await setup(n).run();
		expect(report.status).toBe("ok");
	});

	describe("the tracker's side (errors.ensureRelay)", () => {
		const tracker = {
			projects: ["holocron-cli"],
		};
		const withTracker = (extra: object = {}) =>
			hooked({ layout: layout({ relay: { host: "comlink.example.dev", errors: { ...tracker, ...extra } } }) });
		const ensureRelay = (over: object = {}) =>
			vi.fn(async () => ({
				integration: { created: true, updated: [] as string[] },
				rule: { created: true, updated: [] as string[] },
				clientSecret: "SIGNING-SECRET",
				...over,
			}));

		it("ensures the integration and rule, then gives the Worker the signing secret with the webhook", async () => {
			const relay = { ...collaborators(), errors: { ensureRelay: ensureRelay() } };
			const { run, lines } = setup(withTracker(), { relay });
			const report = await run();
			expect(report.status).toBe("ok");
			expect(relay.errors.ensureRelay).toHaveBeenCalledWith({
				name: "Comlink",
				webhookUrl: "https://comlink.example.dev/sentry",
				projects: ["holocron-cli"],
				rule: { name: "Errors to Discord (Comlink)" },
			});
			expect(relay.workers.deployScript).toHaveBeenCalledWith(
				"comlink",
				expect.objectContaining({
					secrets: { COMLINK_SENTRY_WEBHOOK: HOOK, COMLINK_SENTRY_SECRET: "SIGNING-SECRET" },
				})
			);
			const out = lines.join("\n");
			expect(out).toContain("created sentry integration Comlink");
			expect(out).toContain("created sentry alert rule Errors to Discord (Comlink)");
			expect(out).not.toContain("SIGNING-SECRET");
			expect(JSON.stringify(report)).not.toContain("SIGNING-SECRET");
		});

		it("uses the layout's names and throttle, and reports what it changed", async () => {
			const relay = {
				...collaborators(),
				errors: {
					ensureRelay: ensureRelay({
						integration: { created: false, updated: ["webhook URL"] },
						rule: { created: false, updated: [] },
					}),
				},
			};
			const { run, lines } = setup(withTracker({ integration: "Relay", rule: "To Discord", frequency: 15 }), {
				relay,
			});
			await run();
			expect(relay.errors.ensureRelay).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Relay", rule: { name: "To Discord", frequency: 15 } })
			);
			const out = lines.join("\n");
			expect(out).toContain("updated sentry integration Relay: webhook URL");
			expect(out).toContain("exists  sentry alert rule To Discord");
		});

		it("deploys without a signing secret when the tracker did not give it, and says so", async () => {
			const relay = { ...collaborators(), errors: { ensureRelay: ensureRelay({ clientSecret: undefined }) } };
			const { run, lines } = setup(withTracker(), { relay });
			const report = await run();
			expect(report.status).toBe("ok");
			expect(relay.workers.deployScript).toHaveBeenCalledWith(
				"comlink",
				expect.objectContaining({ secrets: { COMLINK_SENTRY_WEBHOOK: HOOK } })
			);
			expect(lines.join("\n")).toContain("did not give the integration's signing secret");
		});

		it("reports a failure at the tracker but still deploys the Worker with its webhook", async () => {
			const relay = {
				...collaborators(),
				errors: {
					ensureRelay: vi.fn(async () => {
						throw new Error("403 forbidden");
					}),
				},
			};
			const { run } = setup(withTracker(), { relay });
			const report = await run();
			expect(report.status).toBe("fail");
			expect(report.failures.map((f) => f.step)).toEqual(["sentry alert relay"]);
			expect(relay.workers.deployScript).toHaveBeenCalledWith(
				"comlink",
				expect.objectContaining({ secrets: { COMLINK_SENTRY_WEBHOOK: HOOK } })
			);
		});

		it("previews in a dry run without calling the tracker", async () => {
			const relay = { ...collaborators(), errors: { ensureRelay: ensureRelay() } };
			const { run, lines } = setup(withTracker(), { relay, dryRun: true });
			await run();
			expect(relay.errors.ensureRelay).not.toHaveBeenCalled();
			expect(lines.join("\n")).toContain(
				"would ensure the sentry integration Comlink and the alert rule Errors to Discord (Comlink) on holocron-cli"
			);
		});

		it("does nothing at the tracker when the layout names no tracker side, or the provider cannot", async () => {
			const manage = { ...collaborators(), errors: { ensureRelay: ensureRelay() } };
			await setup(hooked(), { relay: manage }).run();
			expect(manage.errors.ensureRelay).not.toHaveBeenCalled();

			const cannot = collaborators();
			const report = await setup(withTracker(), { relay: cannot }).run();
			expect(report.status).toBe("ok");
		});
	});
});

describe("forum channels", () => {
	const TAGS = [
		{ name: "draft", emoji: "✏️", moderated: true },
		{ name: "proposed", emoji: "💬", moderated: true },
	];
	const forumLayout = (channel: object, extra: object = {}): NotificationsLayout => ({
		categories: [{ name: "BUILD", channels: [{ name: "ideas", kind: "forum", tags: TAGS, ...channel }] }],
		...extra,
	});

	it("passes the kind and the tags to the provider, and a text channel neither", async () => {
		const ensureChannel = vi.fn(async (_input: { name: string }) => ({ id: "1", created: true }));
		const layout: NotificationsLayout = {
			categories: [{ name: "BUILD", channels: [{ name: "ideas", kind: "forum", tags: TAGS }, { name: "dev" }] }],
		};

		const report = await setup(fakeNotifications({ layout, ensureChannel })).run();

		expect(report.status).toBe("ok");
		expect(ensureChannel).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ name: "ideas", kind: "forum", tags: TAGS })
		);
		expect(ensureChannel.mock.calls[1]?.[0]).not.toHaveProperty("kind");
		expect(ensureChannel.mock.calls[1]?.[0]).not.toHaveProperty("tags");
	});

	it("passes a forum's default reaction to the provider", async () => {
		const ensureChannel = vi.fn(async (_input: { name: string }) => ({ id: "1", created: true }));
		const layout = forumLayout({ defaultReaction: "👍", starterReactions: ["👍", "👎"] });

		const report = await setup(fakeNotifications({ layout, ensureChannel })).run();

		expect(report.status).toBe("ok");
		expect(ensureChannel).toHaveBeenCalledWith(expect.objectContaining({ name: "ideas", defaultReaction: "👍" }));
	});

	describe("server emoji", () => {
		const IMAGE = ".holocron/media/emoji/git_merge.png";
		const withImage = { emoji: ":git_merge:", image: IMAGE };
		const readImage = vi.fn(
			async (source: string) => `data:image/png;base64,${Buffer.from(source).toString("base64")}`
		);

		it("passes a server emoji default reaction to the provider as the layout wrote it", async () => {
			const ensureChannel = vi.fn(async (_input: { name: string }) => ({ id: "1", created: true }));
			const layout = forumLayout({ defaultReaction: ":git_merge:", starterReactions: [":git_merge:", "👍"] });
			const report = await setup(fakeNotifications({ layout, ensureChannel })).run();
			expect(report.status).toBe("ok");
			expect(ensureChannel).toHaveBeenCalledWith(expect.objectContaining({ defaultReaction: ":git_merge:" }));
		});

		it("makes an emoji from its image before the channels, once however many reactions name it", async () => {
			const order: string[] = [];
			const ensureEmoji = vi.fn(async (_input: { name: string; image: string }) => {
				order.push("emoji");
				return { id: "900", created: true };
			});
			const ensureChannel = vi.fn(async () => {
				order.push("channel");
				return { id: "1", created: true };
			});
			const layout = forumLayout({ defaultReaction: withImage, starterReactions: [withImage, ":git_merge:"] });
			const { run, lines } = setup(fakeNotifications({ layout, ensureChannel, ensureEmoji }), {
				loadEmojiImage: readImage,
			});
			const report = await run();
			expect(report.status).toBe("ok");
			expect(report.emojis).toEqual([{ name: "git_merge", created: true }]);
			expect(ensureEmoji).toHaveBeenCalledTimes(1);
			expect(ensureEmoji).toHaveBeenCalledWith({
				name: "git_merge",
				image: `data:image/png;base64,${Buffer.from(IMAGE).toString("base64")}`,
			});
			expect(order).toEqual(["emoji", "channel"]);
			expect(lines.join("\n")).toContain("created emoji :git_merge: (id 900)");
		});

		it("reads the image from the repository root when no reader is given", async () => {
			const root = await mkdtemp(join(tmpdir(), "emoji-setup-"));
			await mkdir(join(root, ".holocron/media/emoji"), { recursive: true });
			const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
			await writeFile(join(root, IMAGE), png);
			const ensureEmoji = vi.fn(async (_input: { name: string; image: string }) => ({
				id: "900",
				created: true,
			}));
			const layout = forumLayout({ defaultReaction: withImage });
			const report = await setup(fakeNotifications({ layout, ensureEmoji }), { repoRoot: root }).run();
			expect(report.status).toBe("ok");
			expect(ensureEmoji).toHaveBeenCalledWith({
				name: "git_merge",
				image: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
			});
		});

		it("is a no-op when the emoji exists", async () => {
			const ensureEmoji = vi.fn(async (_input: { name: string; image: string }) => ({
				id: "900",
				created: false,
			}));
			const layout = forumLayout({ defaultReaction: withImage });
			const { run, lines } = setup(fakeNotifications({ layout, ensureEmoji }), { loadEmojiImage: readImage });
			const report = await run();
			expect(report.emojis).toEqual([{ name: "git_merge", created: false }]);
			expect(lines.join("\n")).toContain("exists  emoji :git_merge: (id 900)");
		});

		it("only previews on --dry-run", async () => {
			const ensureEmoji = vi.fn(async (_input: { name: string; image: string }) => ({
				id: "900",
				created: true,
			}));
			const layout = forumLayout({ defaultReaction: withImage });
			const { run, lines } = setup(fakeNotifications({ layout, ensureEmoji }), {
				dryRun: true,
				loadEmojiImage: readImage,
			});
			const report = await run();
			expect(report.status).toBe("dry-run");
			expect(ensureEmoji).not.toHaveBeenCalled();
			expect(report.emojis).toBeUndefined();
			expect(lines.join("\n")).toContain("would ensure emoji :git_merge:");
		});

		it("reports an emoji that could not be made and goes on", async () => {
			const ensureEmoji = vi.fn(async (_input: { name: string; image: string }) => {
				throw new Error("Discord refused");
			});
			const layout = forumLayout({ defaultReaction: withImage });
			const report = await setup(fakeNotifications({ layout, ensureEmoji }), { loadEmojiImage: readImage }).run();
			expect(report.status).toBe("fail");
			expect(report.failures).toEqual([{ step: "emoji :git_merge:", message: "Discord refused" }]);
			expect(report.channels).toHaveLength(1);
		});

		describe("an emoji whose picture changed", () => {
			type Input = { name: string; image: string; replace?: boolean };
			type Check = { state: "missing" | "same" | "different" | "unknown"; note?: string };
			const replacing = () => vi.fn(async (_input: Input) => ({ id: "901", created: false, updated: ["image"] }));
			const staying = () => vi.fn(async (_input: Input) => ({ id: "900", created: false }));
			const checking = (states: Record<string, Check>) =>
				vi.fn(
					async (input: { name: string; image: string }) => states[input.name] ?? { state: "same" as const }
				);
			const two = forumLayout({
				defaultReaction: withImage,
				starterReactions: [{ emoji: ":git_branch:", image: ".holocron/media/emoji/git_branch.png" }],
			});
			const asked = (confirm: ReturnType<typeof vi.fn>) => (confirm.mock.calls as unknown as string[][])[0]![0]!;

			it("is replaced, before the channels, and the channel step is handed the same layout to look the new id up", async () => {
				const order: string[] = [];
				const ensureEmoji = vi.fn(async (_input: Input) => {
					order.push("emoji");
					return { id: "901", created: false, updated: ["image"] };
				});
				const ensureChannel = vi.fn(async (_input: { name: string }) => {
					order.push("channel");
					return { id: "1", created: true };
				});
				const checkEmoji = checking({ git_merge: { state: "different" } });
				const layout = forumLayout({ defaultReaction: withImage, starterReactions: [":git_merge:"] });
				const { run, lines } = setup(fakeNotifications({ layout, ensureEmoji, ensureChannel, checkEmoji }), {
					loadEmojiImage: readImage,
					yes: true,
				});
				const report = await run();
				expect(report.status).toBe("ok");
				expect(ensureEmoji).toHaveBeenCalledWith(expect.objectContaining({ name: "git_merge", replace: true }));
				expect(report.emojis).toEqual([{ name: "git_merge", created: false, replaced: true }]);
				expect(lines.join("\n")).toContain("replaced emoji :git_merge: (id 901)");
				expect(order).toEqual(["emoji", "channel"]);
				expect(ensureChannel).toHaveBeenCalledWith(expect.objectContaining({ defaultReaction: withImage }));
			});

			it("leaves a matching emoji alone and asks nothing, so a second run changes nothing", async () => {
				const ensureEmoji = staying();
				const confirm = vi.fn(async () => true);
				const checkEmoji = checking({});
				const { run, lines } = setup(fakeNotifications({ layout: two, ensureEmoji, checkEmoji }), {
					loadEmojiImage: readImage,
					interactive: false,
					confirm,
				});
				const report = await run();
				expect(report.status).toBe("ok");
				expect(checkEmoji).toHaveBeenCalledTimes(2);
				expect(confirm).not.toHaveBeenCalled();
				for (const call of ensureEmoji.mock.calls) expect(call[0]).not.toHaveProperty("replace");
				expect(report.emojis).toEqual([
					{ name: "git_merge", created: false },
					{ name: "git_branch", created: false },
				]);
				expect(lines.join("\n")).toContain("exists  emoji :git_merge: (id 900)");
			});

			it("only replaces the ones that differ, and makes one the server lacks", async () => {
				const ensureEmoji = vi.fn(async (input: Input) => ({
					id: "9",
					created: input.name === "git_branch",
					...(input.replace ? { updated: ["image"] } : {}),
				}));
				const checkEmoji = checking({ git_merge: { state: "different" }, git_branch: { state: "missing" } });
				const report = await setup(fakeNotifications({ layout: two, ensureEmoji, checkEmoji }), {
					loadEmojiImage: readImage,
					yes: true,
				}).run();
				expect(ensureEmoji.mock.calls.map((c) => [c[0].name, c[0].replace])).toEqual([
					["git_merge", true],
					["git_branch", undefined],
				]);
				expect(report.emojis).toEqual([
					{ name: "git_merge", created: false, replaced: true },
					{ name: "git_branch", created: true },
				]);
			});

			it("leaves an emoji alone, saying why, when its picture could not be compared", async () => {
				const ensureEmoji = staying();
				const checkEmoji = checking({
					git_merge: { state: "unknown", note: "the CDN answered 404" },
					git_branch: { state: "unknown" },
				});
				const confirm = vi.fn(async () => true);
				const { run, lines } = setup(fakeNotifications({ layout: two, ensureEmoji, checkEmoji }), {
					loadEmojiImage: readImage,
					interactive: false,
					confirm,
				});
				const report = await run();
				expect(report.status).toBe("ok");
				expect(confirm).not.toHaveBeenCalled();
				for (const call of ensureEmoji.mock.calls) expect(call[0]).not.toHaveProperty("replace");
				expect(lines.join("\n")).toContain(
					"exists  emoji :git_merge: (id 900) (picture not compared: the CDN answered 404)"
				);
				expect(lines.join("\n")).toContain("(picture not compared: unknown)");
			});

			it("treats a check that throws as not compared, never as changed", async () => {
				const ensureEmoji = staying();
				const checkEmoji = vi.fn(async (_input: { name: string; image: string }): Promise<Check> => {
					throw new Error("no bot token");
				});
				const { run, lines } = setup(
					fakeNotifications({ layout: forumLayout({ defaultReaction: withImage }), ensureEmoji, checkEmoji }),
					{ loadEmojiImage: readImage, interactive: false }
				);
				const report = await run();
				expect(report.status).toBe("ok");
				expect(ensureEmoji.mock.calls[0]![0]).not.toHaveProperty("replace");
				expect(lines.join("\n")).toContain("picture not compared: no bot token");
			});

			it("asks first, naming only the emoji that differ and the loss of reactions, and goes on when told yes", async () => {
				const ensureEmoji = replacing();
				const confirm = vi.fn(async () => true);
				const checkEmoji = checking({ git_merge: { state: "different" } });
				const report = await setup(fakeNotifications({ layout: two, ensureEmoji, checkEmoji }), {
					loadEmojiImage: readImage,
					interactive: true,
					confirm,
				}).run();
				expect(report.status).toBe("ok");
				expect(confirm).toHaveBeenCalledOnce();
				const question = asked(confirm);
				expect(question).toContain("The picture of :git_merge: differs");
				expect(question).not.toContain("git_branch");
				expect(question).toContain("Replace it?");
				expect(question).toContain("reactions made with the old one disappear");
			});

			it("names several in the plural", async () => {
				const confirm = vi.fn(async () => true);
				const checkEmoji = checking({ git_merge: { state: "different" }, git_branch: { state: "different" } });
				await setup(fakeNotifications({ layout: two, ensureEmoji: replacing(), checkEmoji }), {
					loadEmojiImage: readImage,
					interactive: true,
					confirm,
				}).run();
				expect(asked(confirm)).toContain("The picture of :git_merge:, :git_branch: differs");
				expect(asked(confirm)).toContain("Replace them?");
			});

			it("writes nothing when the answer is no", async () => {
				const n = fakeNotifications({
					layout: forumLayout({ defaultReaction: withImage }),
					ensureEmoji: replacing(),
					checkEmoji: checking({ git_merge: { state: "different" } }),
				});
				const { run, lines } = setup(n, {
					loadEmojiImage: readImage,
					interactive: true,
					confirm: async () => false,
				});
				const report = await run();
				expect(report.status).toBe("cancelled");
				expect(n.ensureEmoji).not.toHaveBeenCalled();
				expect(n.ensureCategory).not.toHaveBeenCalled();
				expect(lines.join("\n")).toContain("cancelled; nothing was written");
			});

			it("asks through a prompt when no confirm is injected", async () => {
				confirmPrompt.mockResolvedValueOnce(true);
				const report = await setup(
					fakeNotifications({
						layout: forumLayout({ defaultReaction: withImage }),
						ensureEmoji: replacing(),
						checkEmoji: checking({ git_merge: { state: "different" } }),
					}),
					{ loadEmojiImage: readImage, interactive: true }
				).run();
				expect(report.status).toBe("ok");
				expect(confirmPrompt).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
			});

			it("takes the terminal from stdin when it is not said, and refuses without one", async () => {
				const tty = process.stdin.isTTY;
				process.stdin.isTTY = false;
				try {
					const n = fakeNotifications({
						layout: forumLayout({ defaultReaction: withImage }),
						ensureEmoji: replacing(),
						checkEmoji: checking({ git_merge: { state: "different" } }),
					});
					const err = await setup(n, { loadEmojiImage: readImage })
						.run()
						.catch((e: unknown) => e);
					expect(err).toBeInstanceOf(NonInteractiveError);
					expect((err as Error).message).toMatch(/:git_merge: differs from the layout's/);
					expect((err as Error).message).toMatch(/pass --yes to run it without asking, or --dry-run/);
					expect(n.ensureEmoji).not.toHaveBeenCalled();
					expect(n.ensureCategory).not.toHaveBeenCalled();
				} finally {
					process.stdin.isTTY = tty;
				}
			});

			it("says them in the plural when several differ and there is no terminal", async () => {
				const checkEmoji = checking({ git_merge: { state: "different" }, git_branch: { state: "different" } });
				const err = await setup(fakeNotifications({ layout: two, ensureEmoji: replacing(), checkEmoji }), {
					loadEmojiImage: readImage,
					interactive: false,
				})
					.run()
					.catch((e: unknown) => e);
				expect((err as Error).message).toMatch(/would make them again/);
			});

			it("lists each emoji it would replace on --dry-run, with no question and no write", async () => {
				const n = fakeNotifications({
					layout: two,
					ensureEmoji: replacing(),
					checkEmoji: checking({
						git_merge: { state: "different" },
						git_branch: { state: "unknown", note: "x" },
					}),
				});
				const confirm = vi.fn(async () => true);
				const { run, lines } = setup(n, {
					loadEmojiImage: readImage,
					dryRun: true,
					interactive: false,
					confirm,
				});
				const report = await run();
				expect(report.status).toBe("dry-run");
				expect(confirm).not.toHaveBeenCalled();
				expect(n.ensureEmoji).not.toHaveBeenCalled();
				expect(lines.join("\n")).toContain("would replace emoji :git_merge:");
				expect(lines.join("\n")).toContain("would ensure emoji :git_branch:");
				expect(lines.join("\n")).toContain("(picture not compared: x)");
			});

			it("fails closed on an unusable image before comparing, asking or writing", async () => {
				const n = fakeNotifications({
					layout: forumLayout({ defaultReaction: withImage }),
					ensureEmoji: replacing(),
					checkEmoji: checking({ git_merge: { state: "different" } }),
				});
				const confirm = vi.fn(async () => true);
				const report = await setup(n, {
					loadEmojiImage: async () => {
						throw new Error("it is 300 KiB");
					},
					interactive: true,
					confirm,
				}).run();
				expect(report.status).toBe("fail");
				expect(n.checkEmoji).not.toHaveBeenCalled();
				expect(confirm).not.toHaveBeenCalled();
				expect(n.ensureEmoji).not.toHaveBeenCalled();
			});

			it("compares nothing when the layout gives no emoji an image", async () => {
				const n = fakeNotifications({
					layout: forumLayout({ defaultReaction: ":git_merge:" }),
					checkEmoji: checking({}),
				});
				const report = await setup(n, { interactive: false }).run();
				expect(report.status).toBe("ok");
				expect(n.checkEmoji).not.toHaveBeenCalled();
			});

			it("reports a replacement that failed and goes on", async () => {
				const ensureEmoji = vi.fn(async (_input: Input) => {
					throw new Error("Discord refused: the bot lacks Manage Guild Expressions");
				});
				const report = await setup(
					fakeNotifications({
						layout: forumLayout({ defaultReaction: withImage }),
						ensureEmoji,
						checkEmoji: checking({ git_merge: { state: "different" } }),
					}),
					{ loadEmojiImage: readImage, yes: true }
				).run();
				expect(report.status).toBe("fail");
				expect(report.failures[0]?.step).toBe("emoji :git_merge:");
				expect(report.channels).toHaveLength(1);
			});
		});

		it("refuses, before anything is written, an image that cannot be used", async () => {
			const n = fakeNotifications({ layout: forumLayout({ defaultReaction: withImage }), ensureEmoji: vi.fn() });
			const report = await setup(n, {
				loadEmojiImage: async () => {
					throw new Error("it is 300 KiB");
				},
			}).run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(
				/emoji `:git_merge:` image `.holocron\/media\/emoji\/git_merge.png`: it is 300 KiB/
			);
			expect(n.ensureCategory).not.toHaveBeenCalled();
		});

		it("refuses an image when the provider cannot create emoji", async () => {
			const n = fakeNotifications({ layout: forumLayout({ defaultReaction: withImage }) });
			const report = await setup(n, { loadEmojiImage: readImage }).run();
			expect(report.status).toBe("fail");
			expect(report.message).toMatch(/cannot create emoji/);
			expect(n.ensureCategory).not.toHaveBeenCalled();
		});

		it("refuses a layout that gives one emoji two pictures", async () => {
			const layout = forumLayout({
				defaultReaction: withImage,
				starterReactions: [{ emoji: ":git_merge:", image: ".holocron/media/emoji/other.png" }],
			});
			const report = await setup(fakeNotifications({ layout, ensureEmoji: vi.fn() })).run();
			expect(report.message).toMatch(/given two different images/);
		});
	});

	it("refuses an inconsistent forum before anything is created", async () => {
		const n = fakeNotifications({ layout: forumLayout({ webhook: true }) });

		const report = await setup(n).run();

		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/a forum takes no `webhook` or the `monitoring` and `errors` feeds/);
		expect(n.ensureCategory).not.toHaveBeenCalled();
	});

	describe("forumLayoutProblem emojis", () => {
		const withEmojis = (emojis: unknown[]) => ({ ...forumLayout({}), emojis }) as unknown as NotificationsLayout;

		it("accepts an emojis entry with a name and a picture under .holocron/media/", () => {
			expect(
				forumLayoutProblem(
					withEmojis([{ emoji: ":git_commit:", image: ".holocron/media/emoji/git_commit.png" }])
				)
			).toBeUndefined();
		});

		it("refuses an entry that is not a server emoji or has a bad picture", () => {
			expect(forumLayoutProblem(withEmojis([{ emoji: "git_commit", image: ".holocron/media/a.png" }]))).toMatch(
				/an `emojis` entry/
			);
			expect(forumLayoutProblem(withEmojis([{ emoji: ":git_commit:", image: "elsewhere/a.png" }]))).toMatch(
				/an `emojis` entry: `image` must be a file under/
			);
		});

		it("refuses a bare name or an entry with no picture, since nothing could make the emoji", () => {
			expect(forumLayoutProblem(withEmojis([":git_commit:"]))).toBe(
				"an `emojis` entry must be `{ emoji, image }`"
			);
			expect(forumLayoutProblem(withEmojis([{ emoji: ":git_commit:" }]))).toBe(
				"an `emojis` entry must be `{ emoji, image }`"
			);
		});
	});

	describe("forumLayoutProblem", () => {
		it("accepts a forum with tags, a text channel, and a layout with no categories", () => {
			expect(forumLayoutProblem(forumLayout({}))).toBeUndefined();
			expect(forumLayoutProblem({ categories: [{ name: "A", channels: [{ name: "dev" }] }] })).toBeUndefined();
			expect(forumLayoutProblem({})).toBeUndefined();
			expect(forumLayoutProblem({ categories: [{ name: "A" }] })).toBeUndefined();
		});

		it("accepts a forum with no tags", () => {
			expect(forumLayoutProblem(forumLayout({ tags: undefined }))).toBeUndefined();
		});

		it("refuses reactions on a text channel and an empty reaction on a forum", () => {
			const text = { categories: [{ name: "A", channels: [{ name: "dev", defaultReaction: "👍" }] }] };
			expect(forumLayoutProblem(text)).toMatch(/channel `dev`: reactions belong to a forum/);
			expect(forumLayoutProblem(forumLayout({ defaultReaction: " " }))).toMatch(/`defaultReaction` is empty/);
			expect(forumLayoutProblem(forumLayout({ starterReactions: ["👍", ""] }))).toMatch(
				/a starter reaction is empty/
			);
			expect(
				forumLayoutProblem(forumLayout({ defaultReaction: "👍", starterReactions: ["👍", "👎"] }))
			).toBeUndefined();
		});

		it("judges server emoji and their images", () => {
			const reaction = (value: unknown) => forumLayout({ defaultReaction: value });
			expect(forumLayoutProblem(reaction(":git_merge:"))).toBeUndefined();
			expect(forumLayoutProblem(reaction({ emoji: ":git_merge:" }))).toBeUndefined();
			expect(
				forumLayoutProblem(reaction({ emoji: ":git_merge:", image: ".holocron/media/emoji/git_merge.png" }))
			).toBeUndefined();
			expect(forumLayoutProblem(forumLayout({ starterReactions: [":git_merge:", "✅"] }))).toBeUndefined();
			expect(forumLayoutProblem(reaction("git_merge"))).toMatch(/`defaultReaction`: `git_merge` is not an emoji/);
			expect(forumLayoutProblem(reaction(":a:"))).toMatch(/is not an emoji/);
			expect(forumLayoutProblem(reaction({ emoji: "git_merge" }))).toMatch(/`emoji` must be a server emoji/);
			expect(forumLayoutProblem(forumLayout({ starterReactions: [":x y:"] }))).toMatch(/a starter reaction/);
			expect(forumLayoutProblem(reaction({ emoji: ":git_merge:", image: "../x.png" }))).toMatch(
				/`image` must be a file under `.holocron\/media\/`/
			);
			expect(forumLayoutProblem(reaction({ emoji: ":git_merge:", image: "https://x/y.png" }))).toMatch(
				/not a URL/
			);
			expect(forumLayoutProblem(reaction({ emoji: ":git_merge:", image: "" }))).toMatch(/`image` is empty/);
		});

		it("refuses tags on a text channel, whether it says so or not", () => {
			const text = { categories: [{ name: "A", channels: [{ name: "dev", tags: TAGS }] }] };
			const explicit = {
				categories: [{ name: "A", channels: [{ name: "dev", kind: "text" as const, tags: TAGS }] }],
			};

			expect(forumLayoutProblem(text)).toMatch(/channel `dev`: `tags` belong to a forum/);
			expect(forumLayoutProblem(explicit)).toMatch(/`tags` belong to a forum/);
		});

		it("refuses a webhook, a monitoring feed or an errors feed on a forum", () => {
			expect(forumLayoutProblem(forumLayout({ webhook: true }))).toMatch(
				/takes no `webhook` or the `monitoring` and `errors` feeds/
			);
			expect(forumLayoutProblem(forumLayout({ feeds: { monitoring: true } }))).toMatch(
				/takes no `webhook` or the `monitoring` and `errors` feeds/
			);
			expect(forumLayoutProblem(forumLayout({ feeds: { errors: true } }))).toMatch(
				/takes no `webhook` or the `monitoring` and `errors` feeds/
			);
			expect(forumLayoutProblem(forumLayout({ feeds: {} }))).toBeUndefined();
		});

		describe("feeds.prs", () => {
			const PR_TAGS = PR_FEED_TAGS.map((name) => ({ name }));

			it("is accepted on a forum with all eight tags, as true or with an exclude list", () => {
				expect(forumLayoutProblem(forumLayout({ tags: PR_TAGS, feeds: { prs: true } }))).toBeUndefined();
				expect(
					forumLayoutProblem(
						forumLayout({
							tags: PR_TAGS,
							feeds: { prs: { exclude: { repos: ["a/b"], authors: ["bot"] } } },
						})
					)
				).toBeUndefined();
				expect(forumLayoutProblem(forumLayout({ tags: PR_TAGS, feeds: { prs: {} } }))).toBeUndefined();
			});

			it("matches the tag names without regard to case, and allows extra tags", () => {
				const tags = [...PR_TAGS.map((t) => ({ name: t.name.toUpperCase() })), { name: "extra" }];
				expect(forumLayoutProblem(forumLayout({ tags, feeds: { prs: true } }))).toBeUndefined();
			});

			it("is refused on a text channel", () => {
				const layout = { categories: [{ name: "A", channels: [{ name: "dev", feeds: { prs: true } }] }] };
				expect(forumLayoutProblem(layout)).toMatch(/channel `dev`: `feeds.prs` belongs to a forum/);
			});

			it("is not refused on a text channel when it is false", () => {
				const layout = { categories: [{ name: "A", channels: [{ name: "dev", feeds: { prs: false } }] }] };
				expect(forumLayoutProblem(layout)).toBeUndefined();
			});

			it("is refused on a forum that lacks a state's tag, naming the missing ones", () => {
				const tags = PR_TAGS.filter((t) => t.name !== "ready" && t.name !== "merged");
				expect(forumLayoutProblem(forumLayout({ tags, feeds: { prs: true } }))).toMatch(
					/`feeds.prs` needs the tags `ready`, `merged`/
				);
				expect(forumLayoutProblem(forumLayout({ tags: undefined, feeds: { prs: true } }))).toMatch(
					/needs the tags `draft`, `conflicts`/
				);
			});

			it("still refuses a webhook beside it", () => {
				expect(forumLayoutProblem(forumLayout({ tags: PR_TAGS, webhook: true, feeds: { prs: true } }))).toMatch(
					/takes no `webhook`/
				);
			});
		});

		it("refuses a tag with no name, and two tags with one name in any case", () => {
			expect(forumLayoutProblem(forumLayout({ tags: [{ name: "  " }] }))).toMatch(/a tag has no name/);
			expect(forumLayoutProblem(forumLayout({ tags: [{ name: "Draft" }, { name: "draft" }] }))).toMatch(
				/two tags are named `draft`/
			);
		});

		it("accepts a tag's server emoji that has a picture, and refuses one without, by name", () => {
			const emojis = [{ emoji: ":git_merge:", image: ".holocron/media/emoji/git_merge.png" }];
			const tags = [{ name: "merged", emoji: ":git_merge:" }];
			expect(forumLayoutProblem({ ...forumLayout({ tags }), emojis })).toBeUndefined();
			expect(forumLayoutProblem(forumLayout({ tags }))).toMatch(
				/channel `.*`: tag `merged` emoji `:git_merge:` has no picture/
			);
			expect(forumLayoutProblem(forumLayout({ tags: [{ name: "merged", emoji: ":bad name:" }] }))).toMatch(
				/tag `merged` emoji: `:bad name:` is not an emoji/
			);
			expect(forumLayoutProblem(forumLayout({ tags: [{ name: "merged", emoji: "🟣" }] }))).toBeUndefined();
		});

		it("refuses a pinned message for a forum, and allows one for a text channel", () => {
			const pinned = (channel: string) => ({ pinned: [{ channel, content: "hi" }] });
			const layout = {
				categories: [
					{
						name: "BUILD",
						channels: [{ name: "ideas", kind: "forum" as const }, { name: "dev" }],
					},
				],
			};

			expect(forumLayoutProblem({ ...layout, ...pinned("Ideas") })).toMatch(
				/`Ideas` is a forum; a message is pinned in a post/
			);
			expect(forumLayoutProblem({ ...layout, ...pinned("dev") })).toBeUndefined();
		});
	});
});

describe("relay sources (relay.sources, feeds.relay)", () => {
	const HOOK = "https://discord.com/api/webhooks/9/vercel-feed-token";
	const layout = (over: Partial<NotificationsLayout> = {}): NotificationsLayout => ({
		relay: {
			host: "comlink.example.dev",
			sources: { vercel: { capability: "deployment", events: ["deployment.error"], scope: ["prj_1"] } },
		},
		categories: [{ name: "ALERTS", channels: [{ name: "deploys", feeds: { relay: { vercel: true } } }] }],
		...over,
	});
	const hooked = (l: NotificationsLayout = layout()) =>
		fakeNotifications({
			layout: l,
			ensureWebhook: vi.fn(async () => ({ created: true, url: HOOK })),
		});
	const collaborators = () => ({
		workers: {
			key: "workers",
			providerName: "cloudflare",
			deployScript: vi.fn(async (name: string) => ({ scriptName: name })),
		},
		dns: { key: "dns", providerName: "cloudflare", upsertRecord: vi.fn(async (_z: string, r: unknown) => r) },
		readCode: vi.fn(async () => "export default {}"),
	});
	const vendor = (impl: object = {}) => ({
		capability: "deployment" as const,
		provider: "vercel",
		impl: {
			ensureRelaySource: vi.fn(async (input: { secret?: string }) => ({
				created: true,
				updated: [] as string[],
				secret: input.secret,
			})),
			...impl,
		},
	});

	it("makes the vendor's webhook and the channel webhook, then gives the Worker both as secrets without printing them", async () => {
		const relay = collaborators();
		const v = vendor();
		const n = hooked();
		const { run, lines } = setup(n, { relay, vendor: v });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(n.ensureWebhook).toHaveBeenCalledWith({ channel: "deploys", name: "Vercel", category: "ALERTS" });
		const asked = (v.impl.ensureRelaySource as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
			secret: string;
			[key: string]: unknown;
		};
		expect(asked).toMatchObject({
			source: "vercel",
			url: "https://comlink.example.dev/vercel",
			name: "Vercel",
			events: ["deployment.error"],
			scope: ["prj_1"],
		});
		expect(asked.secret).toMatch(/^[0-9a-f]{64}$/);
		expect(relay.workers.deployScript).toHaveBeenCalledWith("comlink", {
			code: "export default {}",
			secrets: { COMLINK_VERCEL_WEBHOOK: HOOK, COMLINK_VERCEL_SECRET: asked.secret },
			routes: ["comlink.example.dev/*"],
		});
		const out = lines.join("\n") + JSON.stringify(report);
		expect(out).toContain("created vercel webhook Vercel");
		expect(out).not.toContain(HOOK);
		expect(out).not.toContain(asked.secret);
	});

	it("leaves the Worker's secret alone when the vendor's webhook already exists and returns none", async () => {
		const relay = collaborators();
		const v = vendor({ ensureRelaySource: vi.fn(async () => ({ created: false, updated: [] as string[] })) });
		const { run, lines } = setup(hooked(), { relay, vendor: v });
		expect((await run()).status).toBe("ok");
		expect(relay.workers.deployScript).toHaveBeenCalledWith(
			"comlink",
			expect.objectContaining({ secrets: { COMLINK_VERCEL_WEBHOOK: HOOK } })
		);
		expect(lines.join("\n")).toContain("the Worker keeps the one it has");
	});

	it("deploys the tracker's source and a vendor's together", async () => {
		const relay = { ...collaborators(), errors: { ensureRelay: undefined } };
		const l = layout({
			categories: [
				{
					name: "ALERTS",
					channels: [
						{ name: "errors", feeds: { errors: true } },
						{ name: "deploys", feeds: { relay: { vercel: true } } },
					],
				},
			],
		});
		const n = fakeNotifications({
			layout: l,
			ensureWebhook: vi.fn(async (w: { name: string }) => ({
				created: true,
				url: `https://discord.com/api/webhooks/9/${w.name}`,
			})),
		});
		const { run } = setup(n, { relay, vendor: vendor() });
		expect((await run()).status).toBe("ok");
		const secrets = (relay.workers.deployScript.mock.calls[0] as unknown as [string, { secrets: object }])[1]
			.secrets;
		expect(Object.keys(secrets).sort()).toEqual([
			"COMLINK_SENTRY_WEBHOOK",
			"COMLINK_VERCEL_SECRET",
			"COMLINK_VERCEL_WEBHOOK",
		]);
	});

	it("reports what the vendor's API cannot do as a failure, and still deploys", async () => {
		const relay = collaborators();
		const v = vendor({
			ensureRelaySource: vi.fn(async () => ({
				created: true,
				updated: [] as string[],
				todo: ["add the endpoint in the dashboard"],
			})),
		});
		const report = await setup(hooked(), { relay, vendor: v }).run();
		expect(report.status).toBe("fail");
		expect(report.failures).toEqual([
			{ step: "vercel relay source vercel", message: "add the endpoint in the dashboard" },
		]);
		expect(relay.workers.deployScript).toHaveBeenCalled();
	});

	it("reports a vendor that throws and still deploys the webhooks it has", async () => {
		const relay = collaborators();
		const v = vendor({
			ensureRelaySource: vi.fn(async () => {
				throw new Error("403 forbidden");
			}),
		});
		const report = await setup(hooked(), { relay, vendor: v }).run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]!.message).toMatch(/403 forbidden/);
		expect(relay.workers.deployScript).toHaveBeenCalled();
	});

	it("fails the source whose provider cannot make a webhook", async () => {
		const report = await setup(hooked(), {
			relay: collaborators(),
			vendor: vendor({ ensureRelaySource: undefined }),
		}).run();
		expect(report.status).toBe("fail");
		expect(report.failures[0]!.message).toMatch(/cannot make a webhook for relay source vercel/);
	});

	it("previews without asking the vendor for anything", async () => {
		const relay = collaborators();
		const v = vendor();
		const n = hooked();
		const { run, lines } = setup(n, { relay, vendor: v, dryRun: true });
		await run();
		expect(v.impl.ensureRelaySource).not.toHaveBeenCalled();
		expect(relay.workers.deployScript).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain(
			"would ensure the vercel webhook Vercel for https://comlink.example.dev/vercel"
		);
		expect(lines.join("\n")).toContain("would ensure webhook Vercel for the relay Worker (vercel)");
	});

	it("refuses a layout whose source is carried by no channel, or whose capability has no provider", async () => {
		const noFeed = await setup(hooked(layout({ categories: [{ name: "A", channels: [{ name: "x" }] }] })), {
			relay: collaborators(),
			vendor: vendor(),
		}).run();
		expect(noFeed.message).toMatch(/carried by no channel/);
		const noProvider = await setup(hooked(), { relay: collaborators() }).run();
		expect(noProvider.status).toBe("fail");
		expect(noProvider.message).toMatch(/`deployment` provider/);
	});

	it("refuses a forum that takes a relay feed", async () => {
		const l = layout({
			categories: [{ name: "A", channels: [{ name: "f", kind: "forum", feeds: { relay: { vercel: true } } }] }],
		});
		expect(forumLayoutProblem(l)).toMatch(/nor `relay` ones/);
	});
});

describe("relay sources — partial and pictured runs", () => {
	const two: NotificationsLayout = {
		relay: {
			host: "comlink.example.dev",
			sources: { vercel: { capability: "deployment" }, doppler: { capability: "deployment" } },
		},
		categories: [
			{
				name: "ALERTS",
				channels: [
					{ name: "deploys", feeds: { relay: { vercel: { avatar: "https://x.test/v.png" } } } },
					{ name: "secrets", feeds: { relay: { doppler: true } } },
				],
			},
		],
	};
	const relay = () => ({
		workers: {
			key: "workers",
			providerName: "cloudflare",
			deployScript: vi.fn(async (name: string) => ({ scriptName: name })),
		},
		dns: { key: "dns", providerName: "cloudflare", upsertRecord: vi.fn(async (_z: string, r: unknown) => r) },
		readCode: vi.fn(async () => "x"),
	});
	const vendor = {
		capability: "deployment" as const,
		provider: "vercel",
		impl: { ensureRelaySource: vi.fn(async () => ({ created: false, updated: [] as string[] })) },
	};

	it("gives a source's webhook the layout's picture, and deploys the other source when one channel fails", async () => {
		const c = relay();
		const n = fakeNotifications({
			layout: two,
			ensureWebhook: vi.fn(async (w: { channel: string }) => {
				if (w.channel === "secrets") throw new Error("discord said no");
				return { created: true, url: "https://discord.com/api/webhooks/1/tok" };
			}),
		});
		const report = await setup(n, {
			relay: c,
			vendor,
			loadAvatar: async () => "data:image/png;base64,AAAA",
		}).run();
		expect(n.ensureWebhook).toHaveBeenCalledWith({
			channel: "deploys",
			name: "Vercel",
			category: "ALERTS",
			avatar: "data:image/png;base64,AAAA",
		});
		expect(report.status).toBe("fail");
		expect(report.failures.map((f) => f.message).join("\n")).toMatch(/no relay webhook for doppler/);
		const secrets = (c.workers.deployScript.mock.calls[0] as unknown as [string, { secrets: object }])[1].secrets;
		expect(Object.keys(secrets)).toEqual(["COMLINK_VERCEL_WEBHOOK"]);
	});
});
