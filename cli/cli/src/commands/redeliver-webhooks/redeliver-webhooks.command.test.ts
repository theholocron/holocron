import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runRedeliverWebhooks = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-redeliver-webhooks/index.js", () => ({ runRedeliverWebhooks }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { redeliverCommand } from "../redeliver/redeliver.command.js";
import { runCommand } from "../run-command.testing.js";
import { redeliverWebhooksEntry } from "./redeliver-webhooks.entry.js";

const go = (...args: string[]) => runCommand(redeliverCommand, ["redeliver", "webhooks", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runRedeliverWebhooks.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("redeliver webhooks", () => {
	it("passes the context and nothing that was not given", async () => {
		await go("--dry-run");
		const input = runRedeliverWebhooks.mock.calls[0]![0];
		expect(input).toMatchObject({
			context: expect.objectContaining({ repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" }),
		});
		for (const key of ["since", "app", "yes"]) expect(input).not.toHaveProperty(key);
	});

	it("passes --since, --app and --yes", async () => {
		await go("--since", "7d", "--app", "Sentinel", "--yes");
		expect(runRedeliverWebhooks.mock.calls[0]![0]).toMatchObject({ since: "7d", app: "Sentinel", yes: true });
	});

	it("exits non-zero when the run fails, and does nothing when the token flags are unusable", async () => {
		runRedeliverWebhooks.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go();
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValueOnce(undefined);
		runRedeliverWebhooks.mockClear();
		await go();
		expect(runRedeliverWebhooks).not.toHaveBeenCalled();
	});

	it("is in the interactive menu, with a dry run", () => {
		expect(redeliverWebhooksEntry).toMatchObject({ name: "redeliver webhooks", supportsDryRun: true });
	});
});
