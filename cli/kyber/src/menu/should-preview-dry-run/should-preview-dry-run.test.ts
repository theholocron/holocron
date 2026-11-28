import { describe, expect, it } from "vitest";

import { entry } from "../__tests__/fixtures.js";
import { shouldPreviewDryRun } from "./should-preview-dry-run.js";

describe("shouldPreviewDryRun", () => {
	it("true for a dry-run-capable command by default", () => {
		expect(shouldPreviewDryRun(entry("doctor"), {})).toBe(true);
		expect(shouldPreviewDryRun(entry("doctor"), { skipDryRun: false })).toBe(true);
	});

	it("false when --skip-dry-run was passed — opts out of the preview entirely", () => {
		expect(shouldPreviewDryRun(entry("doctor"), { skipDryRun: true })).toBe(false);
	});

	it("false for a command whose handler doesn't honour --dry-run", () => {
		expect(shouldPreviewDryRun(entry("auth set"), {})).toBe(false);
	});
});
