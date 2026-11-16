import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { describe, expect, it, vi } from "vitest";

import { writeStepOutput } from "./write-step-output.js";

describe("writeStepOutput", () => {
	it("writes nothing without GITHUB_OUTPUT", () => {
		const append = vi.fn();
		expect(writeStepOutput("uploaded", 3, createEnvLookup({}), append)).toBe(false);
		expect(append).not.toHaveBeenCalled();
	});

	it("appends one name=value line to the named file", () => {
		const file = join(mkdtempSync(join(tmpdir(), "step-output-")), "out");
		writeFileSync(file, "earlier=1\n");
		expect(writeStepOutput("uploaded", 3, createEnvLookup({ GITHUB_OUTPUT: file }))).toBe(true);
		expect(readFileSync(file, "utf8")).toBe("earlier=1\nuploaded=3\n");
	});
});
