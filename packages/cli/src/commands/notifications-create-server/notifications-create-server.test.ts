import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { runNotificationsCreateServer } from "./notifications-create-server.js";
import { pickServerCreator } from "./pick-server-creator.js";

const LAYOUT: NotificationsLayout = {
	categories: [{ name: "START HERE", channels: [{ name: "welcome" }, { name: "rules" }] }],
	server: { systemChannel: "welcome" },
};

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		createServer: vi.fn(async ({ name }: { name: string }) => ({ id: "9000000000000000001", name })),
		inviteLink: vi.fn(async () => "https://discord.gg/abc"),
		hasMember: vi.fn(async () => true),
		transferServer: vi.fn(async () => {}),
		...over,
	} as unknown as Notifications;
}

async function setup(
	notifications: Notifications,
	opts: { dryRun?: boolean; config?: string; setupStatus?: "ok" | "fail" } = {}
) {
	const dir = await mkdtemp(join(tmpdir(), "create-server-"));
	const filepath = join(dir, "holocron.config.ts");
	await writeFile(filepath, opts.config ?? 'guildId: "1303969001822486568",\n');
	const loaded: LoadedConfig = {
		resolved: resolveConfig({ name: "demo", providers: { notifications: ["discord"] } }),
		filepath,
	};
	const modules: Record<string, unknown> = {
		"@theholocron/holocron-plugin-discord": {
			createPlugin: () => ({ name: "discord", capabilities: { notifications: () => notifications } }),
		},
	};
	const loader = new PluginLoader(loaded.resolved, { repoRoot: dir }, (async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg];
	}) as unknown as PluginImporter);
	const lines: string[] = [];
	const runSetup = vi.fn(async () => ({
		status: opts.setupStatus ?? "ok",
		categories: [],
		channels: [],
		roles: [],
		failures: [],
	}));
	return {
		lines,
		filepath,
		runSetup,
		run: (over: Record<string, unknown> = {}) =>
			runNotificationsCreateServer({
				loaded,
				context: { repoRoot: dir, ...(opts.dryRun ? { dryRun: true } : {}) },
				name: "The Holocron",
				owner: "709617107741966407",
				force: true,
				loader,
				print: (l) => lines.push(l),
				logger: fakeLogger(),
				sleep: async () => {},
				pollMs: 1,
				waitMs: 5,
				runSetup: runSetup as never,
				...over,
			}),
	};
}

describe("runNotificationsCreateServer", () => {
	it("creates the server, records its id, applies the layout, invites the owner and hands it over", async () => {
		const n = fakeNotifications();
		const { run, runSetup, filepath, lines } = await setup(n);
		const report = await run();
		expect(report).toMatchObject({
			status: "ok",
			serverId: "9000000000000000001",
			invite: "https://discord.gg/abc",
			configUpdated: true,
		});
		expect(n.createServer).toHaveBeenCalledWith({ name: "The Holocron", force: true });
		expect(await readFile(filepath, "utf8")).toBe('guildId: "9000000000000000001",\n');
		expect(runSetup).toHaveBeenCalledTimes(1);
		expect(n.inviteLink).toHaveBeenCalledWith("welcome");
		expect(n.transferServer).toHaveBeenCalledWith("709617107741966407");
		// Nothing is handed over before the layout is applied.
		expect(vi.mocked(n.transferServer!).mock.invocationCallOrder[0]).toBeGreaterThan(
			runSetup.mock.invocationCallOrder[0]!
		);
		expect(lines.join("\n")).toContain("handed the server to member 709617107741966407");
	});

	it("waits for the owner to join before handing over", async () => {
		const hasMember = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
		const n = fakeNotifications({ hasMember });
		const { run } = await setup(n);
		const report = await run({ waitMs: 100 });
		expect(report.status).toBe("ok");
		expect(hasMember).toHaveBeenCalledTimes(3);
		expect(n.transferServer).toHaveBeenCalledTimes(1);
	});

	it("gives up if the owner never joins, leaves the bot as owner, and says how to finish", async () => {
		const n = fakeNotifications({ hasMember: vi.fn(async () => false) });
		const { run } = await setup(n);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("--resume");
		expect(n.transferServer).not.toHaveBeenCalled();
		// It looked all the way through the configured window (5 ms at 1 ms a look), not just a couple of times.
		expect(n.hasMember).toHaveBeenCalledTimes(6);
	});

	it("--resume skips creating, reruns the idempotent setup, and finishes the hand-over", async () => {
		const n = fakeNotifications({ serverOwner: vi.fn(async () => ({ id: "1", isBot: true })) });
		const { run, runSetup } = await setup(n);
		const report = await run({ resume: true });
		expect(report.status).toBe("ok");
		expect(n.createServer).not.toHaveBeenCalled();
		expect(runSetup).toHaveBeenCalledTimes(1);
		expect(n.transferServer).toHaveBeenCalledWith("709617107741966407");
	});

	it("--resume refuses a server the bot does not own (the config may name another one)", async () => {
		const n = fakeNotifications({ serverOwner: vi.fn(async () => ({ id: "709617107741966407", isBot: false })) });
		const { run, runSetup } = await setup(n);
		const report = await run({ resume: true });
		expect(report.status).toBe("fail");
		expect(report.message).toContain("not owned by the bot");
		expect(runSetup).not.toHaveBeenCalled();
		expect(n.transferServer).not.toHaveBeenCalled();
	});

	it("hands the layout setup the provider it picked and tells it not to load again", async () => {
		const { run, runSetup } = await setup(fakeNotifications());
		await run();
		expect(runSetup).toHaveBeenCalledWith(expect.objectContaining({ provider: "discord", preloaded: true }));
	});

	it("counts a transfer whose answer was lost as done when the owner now holds the server", async () => {
		const transferServer = vi.fn(async () => {
			throw new Error("timeout");
		});
		const serverOwner = vi.fn(async () => ({ id: "709617107741966407", isBot: false }));
		const { run } = await setup(fakeNotifications({ transferServer, serverOwner }));
		expect((await run()).status).toBe("ok");
		const failing = await setup(
			fakeNotifications({ transferServer, serverOwner: vi.fn(async () => ({ id: "1", isBot: true })) })
		);
		expect((await failing.run()).status).toBe("fail");
		const blind = await setup(fakeNotifications({ transferServer }));
		expect((await blind.run()).status).toBe("fail");
	});

	it("does not hand over a server whose layout failed to apply", async () => {
		const n = fakeNotifications();
		const { run } = await setup(n, { setupStatus: "fail" });
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("failed; fix it");
		expect(n.transferServer).not.toHaveBeenCalled();
		expect(n.inviteLink).not.toHaveBeenCalled();
	});

	it("says what to do by hand when it cannot edit the config, and carries on", async () => {
		const { run, lines } = await setup(fakeNotifications(), { config: "export default {};\n" });
		const report = await run();
		expect(report.status).toBe("ok");
		expect(report.configUpdated).toBe(false);
		expect(lines.join("\n")).toContain("Set guildId to 9000000000000000001 by hand");
	});

	it("previews on a dry run and creates nothing", async () => {
		const n = fakeNotifications();
		const { run, lines } = await setup(n, { dryRun: true });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(n.createServer).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("would create the server");
	});

	it("uses its own waiting defaults when none are given", async () => {
		// One missed look, then the owner is in: the real sleep runs once, for the 5 s default's worth of 1 ms.
		const hasMember = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
		const { run } = await setup(fakeNotifications({ hasMember }));
		const report = await run({ sleep: undefined, waitMs: undefined, pollMs: 1, force: false });
		expect(report.status).toBe("ok");
		const quick = await setup(fakeNotifications());
		expect((await quick.run({ pollMs: undefined, waitMs: undefined })).status).toBe("ok");
	});

	it("invites through the first channel of the first category that has any", async () => {
		const n = fakeNotifications({
			layout: { categories: [{ name: "EMPTY" }, { name: "B", channels: [{ name: "chat" }] }] },
		});
		const { run } = await setup(n);
		await run();
		expect(n.inviteLink).toHaveBeenCalledWith("chat");
	});

	it("fails a lost transfer when asking who owns the server fails too", async () => {
		const n = fakeNotifications({
			transferServer: vi.fn(async () => {
				throw new Error("timeout");
			}),
			serverOwner: vi.fn(async () => {
				throw new Error("down");
			}),
		});
		const { run } = await setup(n);
		expect((await run()).status).toBe("fail");
	});

	it("previews a resume without promising to create anything", async () => {
		const { run, lines } = await setup(fakeNotifications(), { dryRun: true });
		await run({ resume: true });
		expect(lines.join("\n")).not.toContain("would create");
		expect(lines.join("\n")).toContain("would check the layout is applied");
	});

	it("refuses a missing name, a bad owner id, and a layout with no channel to invite through", async () => {
		const { run } = await setup(fakeNotifications());
		expect((await run({ name: "  " })).message).toContain("--name");
		expect((await run({ owner: "luke skywalker" })).message).toContain("--owner");
		const bare = await setup(fakeNotifications({ layout: {} }));
		expect((await bare.run()).message).toContain("no channel to invite");
	});

	it("refuses a provider that cannot create a server", async () => {
		const { run } = await setup(fakeNotifications({ createServer: undefined }));
		expect((await run()).status).toBe("fail");
		expect(() => pickServerCreator([fakeNotifications({ transferServer: undefined })])).toThrow();
		expect(pickServerCreator([fakeNotifications()]).providerName).toBe("discord");
	});

	it("reports a provider error plainly and stops", async () => {
		const createServer = vi.fn(async () => {
			throw new ProviderApiError("Discord POST /guilds failed", {
				status: 403,
				details: { message: "no" },
			} as never);
		});
		const n = fakeNotifications({ createServer });
		const { run } = await setup(n);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(n.inviteLink).not.toHaveBeenCalled();
	});
});
