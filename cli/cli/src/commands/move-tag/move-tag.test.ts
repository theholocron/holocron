import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it } from "vitest";

import { runMoveTag } from "./move-tag.js";

describe("runMoveTag", () => {
	it("hands the input to kyber's moveMajorTag, with the command-bound logger when none is given", async () => {
		const calls: string[][] = [];
		const lines: string[] = [];
		const report = await runMoveTag({
			group: "ci",
			version: "1.4.0",
			dryRun: true,
			cwd: "/repo",
			print: (line) => lines.push(line),
			git: (args) => {
				calls.push([...args]);
				return "0123456789abcdef";
			},
		});
		expect(report).toEqual({ status: "dry-run", tag: "ci-v1", target: "ci-v1.4.0" });
		expect(calls[0]).toEqual(["rev-parse", "--verify", "refs/tags/ci-v1.4.0^{commit}"]);
		expect(lines[0]).toContain("Moving ci-v1 to ci-v1.4.0");
	});

	it("uses the logger it is given", async () => {
		const report = await runMoveTag({
			group: "ci",
			version: "1.5.0-alpha.1",
			print: () => {},
			logger: fakeLogger(),
		});
		expect(report.status).toBe("fail");
	});
});
