import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runChannelAdd = vi.hoisted(() => vi.fn());
const runSetup = vi.hoisted(() => vi.fn());
const runCreateServer = vi.hoisted(() => vi.fn());
const runLink = vi.hoisted(() => vi.fn());
const runSyncRoles = vi.hoisted(() => vi.fn());
const runDedupe = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../notifications-channel-add/index.js", () => ({ runNotificationsChannelAdd: runChannelAdd }));
vi.mock("../notifications-setup/index.js", () => ({ runNotificationsSetup: runSetup }));
vi.mock("../notifications-create-server/index.js", () => ({ runNotificationsCreateServer: runCreateServer }));
vi.mock("../notifications-link/index.js", () => ({ runNotificationsLink: runLink }));
vi.mock("../notifications-sync-roles/index.js", () => ({ runNotificationsSyncRoles: runSyncRoles }));
vi.mock("../notifications-dedupe/index.js", () => ({ runNotificationsDedupe: runDedupe }));
vi.mock("@theholocron/kyber/prompts", async (importActual) => ({
	...(await importActual<typeof import("@theholocron/kyber/prompts")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["name"]],
}));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { newCommand } from "../new/new.command.js";
import { runCommand } from "../run-command.testing.js";
import { notificationsCommand } from "./notifications.command.js";

const go = (args: string[]) => runCommand(notificationsCommand, ["notifications", ...args]);
const goNew = (args: string[]) => runCommand(newCommand, ["new", ...args]);
const context = { repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" };

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	for (const run of [runChannelAdd, runSetup, runCreateServer, runLink, runSyncRoles, runDedupe]) {
		run.mockResolvedValue({ status: "ok" });
	}
});
afterEach(() => void (process.exitCode = undefined));

/** Every command that provisions notifications loads the config with the tokens and the org, and exits 1 when its run failed. */
describe.each([
	["notifications setup", runSetup, "notifications", ["setup"]],
	["new server", runCreateServer, "new", ["server", "--owner", "someone"]],
	["notifications link", runLink, "notifications", ["link"]],
	["notifications sync-roles", runSyncRoles, "notifications", ["sync-roles"]],
	["notifications dedupe", runDedupe, "notifications", ["dedupe"]],
	["new channel", runChannelAdd, "new", ["channel", "alerts"]],
] as const)("%s", (_name, run, parent, args) => {
	const goParent = (rest: string[]) => (parent === "new" ? goNew(rest) : go(rest));

	it("runs with the context from the tokens and the org", async () => {
		await goParent([...args]);
		expect(run.mock.calls[0]![0]).toMatchObject({ context });
		expect(process.exitCode).toBeUndefined();
	});

	it("exits 1 when it failed", async () => {
		run.mockResolvedValue({ status: "fail" });
		await goParent([...args]);
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await goParent([...args]);
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

	it("new server passes the owner, and the name, provider, --force and --resume when given", async () => {
		await goNew(["server", "--owner", "someone"]);
		const bare = runCreateServer.mock.calls[0]![0];
		expect(bare.owner).toBe("someone");
		expect(["name", "provider", "force", "resume"].some((k) => k in bare)).toBe(false);
		await goNew(["server", "--owner", "someone", "--name", "Holo", "--provider", "discord", "--force", "--resume"]);
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

	it("dedupe passes the channel, --provider and --yes only when given", async () => {
		await go(["dedupe"]);
		const bare = runDedupe.mock.calls[0]![0];
		expect(["channel", "provider", "yes"].some((k) => k in bare)).toBe(false);
		await go(["dedupe", "prs", "--provider", "discord", "--yes"]);
		expect(runDedupe.mock.calls[1]![0]).toMatchObject({ channel: "prs", provider: "discord", yes: true });
	});

	it("new channel passes the name, and every option it was given", async () => {
		await goNew(["channel", "alerts"]);
		const bare = runChannelAdd.mock.calls[0]![0];
		expect(bare.name).toBe("alerts");
		expect(
			["category", "topic", "withWebhook", "webhookName", "secret", "scope", "provider"].some((k) => k in bare)
		).toBe(false);
		await goNew([
			"channel",
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
	it("a bare `notifications` opens the menu at that group", async () => {
		await go([]);
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				pickMessage: "notifications — choose a subcommand:",
				startPath: ["notifications"],
			})
		);
	});
});
