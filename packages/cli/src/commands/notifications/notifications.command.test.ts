import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runChannelAdd = vi.hoisted(() => vi.fn());
const runSetup = vi.hoisted(() => vi.fn());
const runCreateServer = vi.hoisted(() => vi.fn());
const runLink = vi.hoisted(() => vi.fn());
const runSyncRoles = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../notifications-channel-add/index.js", () => ({ runNotificationsChannelAdd: runChannelAdd }));
vi.mock("../notifications-setup/index.js", () => ({ runNotificationsSetup: runSetup }));
vi.mock("../notifications-create-server/index.js", () => ({ runNotificationsCreateServer: runCreateServer }));
vi.mock("../notifications-link/index.js", () => ({ runNotificationsLink: runLink }));
vi.mock("../notifications-sync-roles/index.js", () => ({ runNotificationsSyncRoles: runSyncRoles }));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["name"]],
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { runCommand } from "../../testing/run-command.js";
import { notificationsCommand } from "./notifications.command.js";

const go = (args: string[]) => runCommand(notificationsCommand, ["notifications", ...args]);
const context = { repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" };

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	for (const run of [runChannelAdd, runSetup, runCreateServer, runLink, runSyncRoles]) {
		run.mockResolvedValue({ status: "ok" });
	}
});
afterEach(() => void (process.exitCode = undefined));

/** Every notifications subcommand loads the config with the tokens and the org, and exits 1 when its run failed. */
describe.each([
	["setup", runSetup, ["setup"]],
	["create-server", runCreateServer, ["create-server", "--owner", "someone"]],
	["link", runLink, ["link"]],
	["sync-roles", runSyncRoles, ["sync-roles"]],
	["channel add", runChannelAdd, ["channel", "add", "alerts"]],
] as const)("notifications %s", (_name, run, args) => {
	it("runs with the context from the tokens and the org", async () => {
		await go([...args]);
		expect(run.mock.calls[0]![0]).toMatchObject({ context });
		expect(process.exitCode).toBeUndefined();
	});

	it("exits 1 when it failed", async () => {
		run.mockResolvedValue({ status: "fail" });
		await go([...args]);
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await go([...args]);
		expect(run).not.toHaveBeenCalled();
	});
});

describe("notifications options", () => {
	it("setup passes --scope and --provider only when given", async () => {
		await go(["setup"]);
		expect("scope" in runSetup.mock.calls[0]![0] || "provider" in runSetup.mock.calls[0]![0]).toBe(false);
		await go(["setup", "--scope", "env=stg", "--provider", "discord"]);
		expect(runSetup.mock.calls[1]![0]).toMatchObject({
			scope: { kind: "environment", name: "stg" },
			provider: "discord",
		});
	});

	it("create-server passes the owner, and the name, provider, --force and --resume when given", async () => {
		await go(["create-server", "--owner", "someone"]);
		const bare = runCreateServer.mock.calls[0]![0];
		expect(bare.owner).toBe("someone");
		expect(["name", "provider", "force", "resume"].some((k) => k in bare)).toBe(false);
		await go([
			"create-server",
			"--owner",
			"someone",
			"--name",
			"Holo",
			"--provider",
			"discord",
			"--force",
			"--resume",
		]);
		expect(runCreateServer.mock.calls[1]![0]).toMatchObject({
			name: "Holo",
			provider: "discord",
			force: true,
			resume: true,
		});
	});

	it("link passes --provider when given", async () => {
		await go(["link", "--provider", "discord"]);
		expect(runLink.mock.calls[0]![0]).toMatchObject({ provider: "discord" });
		await go(["link"]);
		expect("provider" in runLink.mock.calls[1]![0]).toBe(false);
	});

	it("sync-roles passes --keep, and --provider when given", async () => {
		await go(["sync-roles", "--keep", "--provider", "discord"]);
		expect(runSyncRoles.mock.calls[0]![0]).toMatchObject({ keep: true, provider: "discord" });
		await go(["sync-roles"]);
		expect("provider" in runSyncRoles.mock.calls[1]![0]).toBe(false);
	});

	it("channel add passes the name, and every option it was given", async () => {
		await go(["channel", "add", "alerts"]);
		const bare = runChannelAdd.mock.calls[0]![0];
		expect(bare.name).toBe("alerts");
		expect(
			["category", "topic", "withWebhook", "webhookName", "secret", "scope", "provider"].some((k) => k in bare)
		).toBe(false);
		await go([
			"channel",
			"add",
			"alerts",
			"--category",
			"Ops",
			"--topic",
			"t",
			"--with-webhook",
			"--webhook-name",
			"hook",
			"--secret",
			"ALERTS_WEBHOOK",
			"--scope",
			"org=acme",
			"--provider",
			"discord",
		]);
		expect(runChannelAdd.mock.calls[1]![0]).toMatchObject({
			category: "Ops",
			topic: "t",
			withWebhook: true,
			webhookName: "hook",
			secret: "ALERTS_WEBHOOK",
			scope: { kind: "organization", name: "acme" },
			provider: "discord",
		});
	});
});

describe("notifications menus", () => {
	it("a bare `notifications` or `notifications channel` opens the menu at that group", async () => {
		await go([]);
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			"notifications — choose a subcommand:",
			expect.any(String),
			["notifications"]
		);
		await go(["channel"]);
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			"notifications channel — choose a subcommand:",
			expect.any(String),
			["notifications", "channel"]
		);
	});
});
