import { describe, expect, it, vi } from "vitest";

import { reportProgress } from "./report-progress.js";

describe("reportProgress", () => {
	it("hands the hook the counts", () => {
		const hook = vi.fn();
		reportProgress(hook, 2, 5);
		expect(hook).toHaveBeenCalledWith(2, 5);
	});

	it("does nothing without a hook", () => {
		expect(() => reportProgress(undefined, 1, 1)).not.toThrow();
	});

	it("swallows a hook that throws", () => {
		expect(() =>
			reportProgress(
				() => {
					throw new Error("boom");
				},
				1,
				1
			)
		).not.toThrow();
	});
});
