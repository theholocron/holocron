import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Run } from "../../../utils/index.js";
import { recordDeploys } from "./record-deploys.js";
import type { DeployRecordFile } from "./record-deploys.type.js";

const ok = { status: 0, stdout: "", stderr: "" };
const FILE: DeployRecordFile = {
	to: "newsha",
	deployed: [
		{ pkg: "@x/app", tag: "deployed/x-app" },
		{ pkg: "@x/site", tag: "deployed/x-site" },
	],
};

function record(
	file: string | undefined,
	{ token = "tok", dryRun = false, run = vi.fn<Run>(() => ok) }: { token?: string; dryRun?: boolean; run?: Run } = {}
) {
	const lines: string[] = [];
	const report = recordDeploys(
		{ cwd: "/repo", file: "deployed.json", token, dryRun, print: (l) => lines.push(l) },
		{ run, readFile: () => file }
	);
	return { report, lines, run };
}

describe("recordDeploys", () => {
	it("tags and pushes the marker of each package the deploy listed, at the release commit", () => {
		const { report, run } = record(JSON.stringify(FILE));

		expect(report.status).toBe("ok");
		expect(report.results.map((r) => [r.pkg, r.status])).toEqual([
			["@x/app", "ok"],
			["@x/site", "ok"],
		]);
		expect(run).toHaveBeenCalledWith("git", ["tag", "--force", "deployed/x-app", "newsha"], { cwd: "/repo" });
		expect(run).toHaveBeenCalledWith(
			"git",
			["push", "--force", "origin", "refs/tags/deployed/x-site"],
			expect.objectContaining({ env: expect.objectContaining({ GIT_CONFIG_COUNT: "1" }) })
		);
	});

	it("skips when no record file exists (nothing deployed) or it lists nothing", () => {
		const missing = record(undefined);
		expect(missing.report).toEqual({ status: "skip", results: [] });
		expect(missing.lines).toEqual(["No deploy to record."]);
		expect(missing.run).not.toHaveBeenCalled();

		const empty = record(JSON.stringify({ to: "x", deployed: [] }));
		expect(empty.report.status).toBe("skip");
		expect(empty.run).not.toHaveBeenCalled();
	});

	it("fails, writing nothing, on a record file that is not JSON", () => {
		const { report, lines, run } = record("{nope");
		expect(report.status).toBe("fail");
		expect(lines[0]).toContain("is not valid JSON");
		expect(run).not.toHaveBeenCalled();
	});

	it("fails, writing nothing, when there is no token", () => {
		const { report, lines, run } = record(JSON.stringify(FILE), { token: "" });
		expect(report.status).toBe("fail");
		expect(lines[0]).toContain("GITHUB_TOKEN");
		expect(run).not.toHaveBeenCalled();
	});

	it("fails the step, naming the package, when a tag cannot be written, but still records the others", () => {
		const run = vi.fn<Run>((_c, args) =>
			args[0] === "push" && args[3] === "refs/tags/deployed/x-app"
				? { status: 1, stdout: "", stderr: "denied" }
				: ok
		);
		const { report, lines } = record(JSON.stringify(FILE), { run });

		expect(report.status).toBe("fail");
		expect(report.results.map((r) => [r.pkg, r.status])).toEqual([
			["@x/app", "fail"],
			["@x/site", "ok"],
		]);
		expect(lines[0]).toBe("✗ @x/app: couldn't push deployed/x-app: denied; the next release may deploy it again.");
	});

	it("writes nothing on a dry run, not even without a token", () => {
		const { report, run, lines } = record(JSON.stringify(FILE), { dryRun: true, token: "" });

		expect(report.status).toBe("ok");
		expect(report.results.every((r) => r.status === "dry-run")).toBe(true);
		expect(lines[0]).toBe("@x/app: would tag deployed/x-app at newsha.");
		expect(run).not.toHaveBeenCalled();
	});

	it("reads the record file from disk by default, and treats a missing one as nothing to record", () => {
		const dir = mkdtempSync(join(tmpdir(), "record-deploys-"));
		try {
			const lines: string[] = [];
			const none = recordDeploys({
				cwd: dir,
				file: join(dir, "absent.json"),
				token: "t",
				print: (l) => lines.push(l),
			});
			expect(none.status).toBe("skip");

			writeFileSync(join(dir, "empty.json"), JSON.stringify({ to: "x", deployed: [] }));
			const empty = recordDeploys({ cwd: dir, file: join(dir, "empty.json"), token: "t", print: () => {} });
			expect(empty.status).toBe("skip");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
