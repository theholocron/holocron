import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it } from "vitest";

import { createProjectRows } from "./project-rows.js";

describe("createProjectRows", () => {
	it("counts rows, prints them and reports ok", () => {
		const lines: string[] = [];
		const rows = createProjectRows((l) => lines.push(stripVTControlCharacters(l)), undefined);
		rows.ok("a", "detail");
		rows.skip("b");
		rows.line("plain");
		const report = rows.finish("project x");
		expect(report).toEqual({ status: "ok", summary: { ok: 1, fail: 0, skip: 1 } });
		expect(lines).toContain("plain");
		expect(lines.join("\n")).toContain("a  (detail)");
		expect(lines.at(-1)).toMatch(/1 ok, 0 failed, 1 skipped$/);
	});

	it("reports fail and logs a warning when a row failed", () => {
		const logger = fakeLogger();
		const rows = createProjectRows(() => {}, logger);
		rows.fail("c", "boom");
		expect(rows.finish("project x").status).toBe("fail");
		expect(logger.warn).toHaveBeenCalled();
	});
});
