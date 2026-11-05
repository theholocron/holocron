import { describe, expect, it } from "vitest";

import type { BoardTemplate } from "../../plugin/index.js";
import { board, roadmapState } from "../project/testing/fake-projects.js";
import { boardRows } from "./board-rows.js";

const template = (over: Partial<BoardTemplate> = {}): BoardTemplate => ({
	name: "t",
	statuses: [{ name: "Todo", category: "planned" }],
	fields: [],
	views: [],
	...over,
});
const state = (over: Parameters<typeof roadmapState>[1] = {}) =>
	roadmapState(board("v5"), { statuses: ["Todo"], fields: [], views: [], rules: [], ...over });

describe("boardRows", () => {
	it("reports every option of a select field as missing when the live field lists none", () => {
		const rows = boardRows(
			"v5",
			template({ fields: [{ name: "Size", type: "single_select", options: ["S", "M"] }] }),
			state({ fields: [{ name: "Size", type: "single_select" }] })
		);
		const size = rows.find((r) => r.id === "project:v5:field:Size");
		expect(size?.status).toBe("fail");
		expect(size?.problems).toEqual(["missing option S", "missing option M"]);
	});

	it("says a view has no filter when the template declares one and the live view has none", () => {
		const rows = boardRows(
			"v5",
			template({ views: [{ name: "Active", layout: "board", filter: "status:Todo" }] }),
			state({ views: [{ name: "Active", layout: "board" }] })
		);
		const view = rows.find((r) => r.id === "project:v5:view:Active");
		expect(view?.problems).toEqual(["filter is none, declared status:Todo"]);
	});

	it("describes a view without a filter by its layout alone", () => {
		const rows = boardRows(
			"v5",
			template({ views: [{ name: "All", layout: "table" }] }),
			state({ views: [{ name: "All", layout: "table" }] })
		);
		expect(rows.find((r) => r.id === "project:v5:view:All")).toMatchObject({ status: "ok", detail: "table" });
	});
});
