import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
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
				setSecret: async (_s: unknown, name: string, value: string) => void stored.push({ name, value }),
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
		expect(lines.join("\n")).toContain("1 step(s) need attention");
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
			message: expect.stringMatching(/no org to store webhook secrets/),
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
		expect(n.ensureCategory).toHaveBeenCalledWith("EMPTY");
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
		expect(report.message).toMatch(/both store their webhook in HOLOCRON_NOTIFY_WEBHOOK_RELEASE_NOTES/);
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
});
