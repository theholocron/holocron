import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { describe, expect, it, vi } from "vitest";

import { writeJobSummary } from "./write-job-summary.js";

describe("writeJobSummary", () => {
	it("appends the text to the summary file", () => {
		const append = vi.fn();
		const env = createEnvLookup({ GITHUB_STEP_SUMMARY: "/tmp/summary.md" });
		expect(writeJobSummary("## Hi", env, append)).toBe(true);
		expect(append).toHaveBeenCalledWith("/tmp/summary.md", "## Hi\n");
	});

	it("does nothing outside Actions", () => {
		const append = vi.fn();
		expect(writeJobSummary("## Hi", createEnvLookup({}), append)).toBe(false);
		expect(append).not.toHaveBeenCalled();
	});

	it("returns false instead of throwing when the file cannot be written", () => {
		const env = createEnvLookup({ GITHUB_STEP_SUMMARY: "/nope" });
		const append = () => {
			throw new Error("EACCES");
		};
		expect(writeJobSummary("x", env, append)).toBe(false);
	});

	it("appends to a real file by default", () => {
		const file = join(mkdtempSync(join(tmpdir(), "summary-")), "s.md");
		const env = createEnvLookup({ GITHUB_STEP_SUMMARY: file });
		expect(writeJobSummary("a", env)).toBe(true);
		expect(writeJobSummary("b", env)).toBe(true);
		expect(readFileSync(file, "utf8")).toBe("a\nb\n");
	});
});
