import { describe, expect, it } from "vitest";

import { DRY_RUN_NOOP_EXIT_CODE } from "./dry-run-noop-exit-code.js";

describe("DRY_RUN_NOOP_EXIT_CODE", () => {
	it("is the reserved code 2", () => {
		expect(DRY_RUN_NOOP_EXIT_CODE).toBe(2);
	});
});
