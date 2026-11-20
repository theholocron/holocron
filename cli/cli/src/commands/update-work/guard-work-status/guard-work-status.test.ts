import { describe, expect, it } from "vitest";

import { guardWorkStatus } from "./guard-work-status.js";

describe("guardWorkStatus", () => {
	it.each(["In Review", "in review", "in-review", "IN_REVIEW", " Blocked ", "Done"])(
		"refuses %s without --force",
		(status) => {
			const guard = guardWorkStatus(status, false);
			expect(guard.ok).toBe(false);
			expect((guard as { problem: string }).problem).toMatch(/--force/);
		}
	);

	it("lets --force through and says it was forced", () => {
		expect(guardWorkStatus("Done", true)).toEqual({ ok: true, forced: true });
	});

	it("needs no flag for the other statuses", () => {
		expect(guardWorkStatus("In Progress", undefined)).toEqual({ ok: true, forced: false });
		expect(guardWorkStatus("Planned", false)).toEqual({ ok: true, forced: false });
	});
});
