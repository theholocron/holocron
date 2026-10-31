import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { MissingTokenError, WorkspaceContextError } from "../../plugin/index.js";
import type { DeepCheck, DeepCheckOutcome } from "../deep-checks/index.js";
import { runDoctorAll } from "./doctor-all.js";

vi.mock("../deep-checks/index.js", () => ({
	DEEP_CHECKS: [
		{
			name: "default",
			capability: "source",
			command: {},
			run: async () => ({ status: "ok", summary: { ok: 1, fail: 0, skip: 0 } }),
		},
	],
}));

const input = { loaded: {} as never, context: {} as never };

const check = (name: string, run: DeepCheck["run"]): DeepCheck => ({
	name,
	capability: "source",
	command: {} as never,
	run,
});
const outcome = (status: DeepCheckOutcome["status"], ok: number, fail: number, skip: number, reason?: string) =>
	({ status, summary: { ok, fail, skip }, ...(reason ? { reason } : {}) }) as DeepCheckOutcome;

async function run(checks: DeepCheck[]) {
	const lines: string[] = [];
	const report = await runDoctorAll({
		...input,
		checks,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

describe("runDoctorAll", () => {
	it("prints one row per check and the count of checks, and passes when none failed", async () => {
		const { report, lines } = await run([
			check("alpha", async () => outcome("ok", 3, 0, 0)),
			check("beta", async () => outcome("ok", 2, 0, 1)),
		]);
		expect(report.status).toBe("ok");
		expect(report.summary).toEqual({ ok: 2, fail: 0, skip: 0 });
		expect(lines).toEqual(["  ✓ alpha  3 ok", "  ✓ beta   2 ok, 1 skipped", "", "2 ok, 0 fail, 0 skipped"]);
	});

	it("shows a skip with its reason and does not fail the run", async () => {
		const { report, lines } = await run([
			check("alpha", async () => outcome("skip", 0, 0, 1, "no source provider")),
			check("beta", async () => outcome("ok", 1, 0, 0)),
		]);
		expect(report.status).toBe("ok");
		expect(report.summary).toEqual({ ok: 1, fail: 0, skip: 1 });
		expect(lines[0]).toContain("no source provider");
	});

	it("falls back to the counts when a skip gave no reason", async () => {
		const { report } = await run([check("alpha", async () => outcome("skip", 0, 0, 2))]);
		expect(report.rows[0]!.detail).toBe("0 ok, 2 skipped");
	});

	it("fails the run on a failing check and points at its own command", async () => {
		const { report } = await run([
			check("alpha", async () => outcome("fail", 1, 2, 0)),
			check("beta", async () => outcome("ok", 1, 0, 0)),
		]);
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({
			status: "fail",
			detail: "1 ok, 2 failed",
			problems: ["run `holocron doctor alpha` for the steps"],
		});
	});

	it("prefers a failing check's reason to its counts", async () => {
		const { report } = await run([check("alpha", async () => outcome("fail", 0, 1, 0, "no layout declared"))]);
		expect(report.rows[0]!.detail).toBe("no layout declared");
	});

	it("turns a MissingTokenError into a skip and any other error into that check's failure, and keeps going", async () => {
		const { report } = await run([
			check("alpha", async () => {
				throw new MissingTokenError("needs the org token");
			}),
			check("beta", async () => {
				throw new Error("boom");
			}),
			check("gamma", async () => outcome("ok", 1, 0, 0)),
		]);
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["alpha", "skip", "needs the org token"],
			["beta", "fail", "boom"],
			["gamma", "ok", "1 ok"],
		]);
		expect(report.status).toBe("fail");
	});

	it("lets the whole run fail when the plugins cannot be resolved here", async () => {
		await expect(
			run([
				check("alpha", async () => {
					throw new WorkspaceContextError("doctor alpha", ["@theholocron/holocron-plugin-github"]);
				}),
			])
		).rejects.toBeInstanceOf(WorkspaceContextError);
	});

	it("runs the checks silently and hands each the same input", async () => {
		const seen = vi.fn(async (i: Parameters<DeepCheck["run"]>[0]) => {
			i.print?.("a check's own row");
			return outcome("ok", 1, 0, 0);
		});
		const logger = fakeLogger();
		const lines: string[] = [];
		await runDoctorAll({ ...input, checks: [check("alpha", seen)], print: (l) => lines.push(l), logger });
		expect(lines.join("\n")).not.toContain("a check's own row");
		expect(seen.mock.calls[0]![0]).toMatchObject({ loaded: input.loaded, context: input.context, logger });
	});

	it("is skipped, not ok, when there are no checks, and runs every registered check by default", async () => {
		expect((await run([])).report.status).toBe("skip");
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorAll({ ...input });
		log.mockRestore();
		expect(report.rows.map((r) => r.id)).toEqual(["default"]);
	});
});
