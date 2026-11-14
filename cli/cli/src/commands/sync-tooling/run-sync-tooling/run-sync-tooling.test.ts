import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { Tooling } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runSyncTooling } from "./run-sync-tooling.js";
import type { RunSyncToolingInput } from "./run-sync-tooling.type.js";

const tool = (providerName: string, sync: () => Promise<void> = async () => undefined): Tooling =>
	({ key: "tooling", providerName, sync: vi.fn(sync), doctor: vi.fn() }) as unknown as Tooling;

async function run(
	tools: Tooling[],
	options: Partial<RunSyncToolingInput> & { providers?: Record<string, unknown> } = {}
) {
	const { providers = { tooling: ["postman"] }, ...rest } = options;
	const lines: string[] = [];
	const report = await runSyncTooling({
		loaded: loadedWith(providers),
		context: { repoRoot: "/x" },
		loader: fakeLoader(tools.length > 0 ? { tooling: tools } : {}),
		print: (line) => lines.push(stripVTControlCharacters(line)),
		...rest,
	});
	return { report, text: lines.join("\n") };
}

describe("runSyncTooling", () => {
	it("syncs each tooling provider and gives each a row", async () => {
		const a = tool("postman");
		const b = tool("bruno");
		const { report, text } = await run([a, b]);
		expect(a.sync).toHaveBeenCalledTimes(1);
		expect(b.sync).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([
			["postman", "ok"],
			["bruno", "ok"],
		]);
		expect(text).toContain("Holocron sync tooling");
	});

	it("calls no provider on a dry run and says what it would sync", async () => {
		const a = tool("postman");
		const { report, text } = await run([a], { context: { repoRoot: "/x", dryRun: true } });
		expect(a.sync).not.toHaveBeenCalled();
		expect(report.rows).toEqual([expect.objectContaining({ id: "postman", status: "skip", detail: "would sync" })]);
		expect(report.status).toBe("ok");
		expect(text).toContain("(dry-run)");
	});

	it("reports a provider that throws, and still runs the others", async () => {
		const bad = tool("postman", async () => {
			throw new Error("401 invalid key");
		});
		const good = tool("bruno");
		const { report } = await run([bad, good]);
		expect(good.sync).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ id: "postman", status: "fail" });
		expect(report.rows[0]!.detail).toContain("401 invalid key");
		expect(report.rows[1]).toMatchObject({ id: "bruno", status: "ok" });
	});

	it("fails with a hint when the config has no tooling provider", async () => {
		const { report } = await run([], { providers: {} });
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({ id: "tooling", status: "fail" });
		expect(report.rows[0]!.detail).toContain("providers.tooling");
	});

	it("fails when the tooling provider could not be loaded, with the reason", async () => {
		const failing = fakeLoader({}, { tooling: "Cannot find package" });
		const { report } = await run([], { loader: failing });
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.detail).toContain("Cannot find package");
	});

	it("fails without a reason when the provider is missing and nothing says why", async () => {
		const { report } = await run([]);
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.detail).toBe("the `tooling` provider is not available");
	});
});
