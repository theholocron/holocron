import { describe, expect, it } from "vitest";

import type { CheckRow } from "../check-row/index.js";
import { summariseChecks } from "./summarise-checks.js";

const row = (over: Partial<CheckRow> = {}): CheckRow => ({
	id: "a",
	title: "a thing",
	status: "ok",
	detail: "fine",
	problems: [],
	...over,
});

describe("summariseChecks", () => {
	it("counts each way a row can end", () => {
		const rows = [row(), row(), row({ status: "fail" }), row({ status: "skip" })];
		expect(summariseChecks(rows)).toEqual({ ok: 2, fail: 1, skip: 1 });
	});

	it("is all zeros for no rows", () => {
		expect(summariseChecks([])).toEqual({ ok: 0, fail: 0, skip: 0 });
	});
});
