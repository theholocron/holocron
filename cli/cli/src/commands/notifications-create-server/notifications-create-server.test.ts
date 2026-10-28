import { access, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

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
		// Once as a preview before the server exists, once for real after it.
		expect(runSetup).toHaveBeenCalledTimes(2);
		expect((runSetup.mock.calls as unknown as Array<[{ context: { dryRun?: boolean } }]>)[0]![0]).toMatchObject({
			context: { dryRun: true },
		});
		expect(
			(runSetup.mock.calls as unknown as Array<[{ context: { dryRun?: boolean } }]>)[1]![0].context.dryRun
		).toBeUndefined();
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

	it("--resume carries on with a provider that cannot say who owns the server", async () => {
		const n = fakeNotifications();
		const { run } = await setup(n);
		expect((await run({ resume: true })).status).toBe("ok");
		expect(n.transferServer).toHaveBeenCalled();
	});

	it("--resume refuses a server whose name is not the one asked for", async () => {
		const n = fakeNotifications({ serverOwner: vi.fn(async () => ({ id: "1", isBot: true, name: "Old Server" })) });
		const { run, runSetup } = await setup(n);
		const report = await run({ resume: true, name: "The Holocron" });
		expect(report.message).toContain('called "Old Server", not "The Holocron"');
		expect(runSetup).not.toHaveBeenCalled();
		// Same name, or no name given, goes ahead.
		const same = fakeNotifications({
			serverOwner: vi.fn(async () => ({ id: "1", isBot: true, name: "The Holocron" })),
		});
		expect((await (await setup(same)).run({ resume: true, name: "The Holocron" })).status).toBe("ok");
		const unnamed = fakeNotifications({ serverOwner: vi.fn(async () => ({ id: "1", isBot: true })) });
		expect((await (await setup(unnamed)).run({ resume: true, name: "The Holocron" })).status).toBe("ok");
	});

	it("refuses to run twice at once, and lets go of the lock afterwards", async () => {
		const n = fakeNotifications();
		const { run, filepath } = await setup(n);
		await writeFile(`${filepath}.create-server.lock`, "123\n");
		const blocked = await run();
		expect(blocked.status).toBe("fail");
		expect(blocked.message).toContain("another create-server run holds");
		expect(n.createServer).not.toHaveBeenCalled();
		await unlink(`${filepath}.create-server.lock`);
		expect((await run()).status).toBe("ok");
		await expect(access(`${filepath}.create-server.lock`)).rejects.toThrow();
		// Failing runs let go of it too.
		const failing = await setup(fakeNotifications({ hasMember: vi.fn(async () => false) }));
		expect((await failing.run()).status).toBe("fail");
		await expect(access(`${failing.filepath}.create-server.lock`)).rejects.toThrow();
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

	it("creates nothing when the layout cannot be applied", async () => {
		const n = fakeNotifications();
		const { run, runSetup } = await setup(n);
		runSetup.mockResolvedValueOnce({ status: "fail", message: "cannot manage roles", failures: [] } as never);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("no server was created");
		expect(report.message).toContain("cannot manage roles");
		expect(n.createServer).not.toHaveBeenCalled();
		runSetup.mockResolvedValueOnce({ status: "fail", failures: [{ step: "x", message: "boom" }] } as never);
		expect((await run()).message).toContain("boom");
		runSetup.mockResolvedValueOnce({ status: "fail", failures: [] } as never);
		expect((await run()).message).toContain("setup --dry-run");
	});

	it("creates nothing when the layout stores secrets and there is no secrets provider", async () => {
		const n = fakeNotifications({
			layout: { categories: [{ name: "A", channels: [{ name: "welcome", webhook: true }] }] },
		});
		const { run } = await setup(n);
		const report = await run();
		expect(report.message).toContain("`secrets` capability");
		expect(n.createServer).not.toHaveBeenCalled();
		const roles = await setup(
			fakeNotifications({
				layout: { categories: [{ name: "A", channels: [{ name: "w" }] }], roles: [{ name: "r", secret: "S" }] },
			})
		);
		expect((await roles.run()).message).toContain("`secrets` capability");
	});

	it("does not hand over a server whose layout failed to apply", async () => {
		const n = fakeNotifications();
		const { run, runSetup } = await setup(n);
		// The preview passes (nothing in the way before the server exists); the real run then fails.
		const ok = { status: "ok", categories: [], channels: [], roles: [], failures: [] };
		runSetup.mockResolvedValueOnce(ok as never).mockResolvedValueOnce({ ...ok, status: "fail" } as never);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("failed; fix it");
		expect(n.createServer).toHaveBeenCalled();
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
		const plan = lines.map((l) => stripVTControlCharacters(l).trimEnd());
		expect(plan.filter((l) => l.startsWith("  ")).map((l) => l.trim())).toEqual([
			'· create the server "The Holocron"',
			"· apply the layout",
			expect.stringMatching(/^· invite member \d+ through #\S+$/),
			"· wait for them to join",
			"· hand the server over",
			expect.stringMatching(/^· write its id into .+holocron\.config\.ts$/),
		]);
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

	it("accepts a layout that only names its welcome channel in the server settings", async () => {
		const { run } = await setup(fakeNotifications({ layout: { server: { systemChannel: "welcome" } } }));
		expect((await run()).status).toBe("ok");
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
		const plan = lines.map((l) => stripVTControlCharacters(l).trimEnd());
		expect(plan.filter((l) => l.startsWith("  ")).map((l) => l.trim())).toEqual([
			"· check the layout is applied to the server in the config",
			expect.stringMatching(/^· invite member \d+ through #\S+$/),
			"· wait for them to join",
			"· hand the server over",
		]);
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
