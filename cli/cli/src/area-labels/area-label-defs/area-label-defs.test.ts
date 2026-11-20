import { describe, expect, it } from "vitest";

import { AREA_LABEL_COLOR, areaLabelDefs } from "./area-label-defs.js";

describe("areaLabelDefs", () => {
	it("makes one label per area with the family colour and its paths", () => {
		expect(areaLabelDefs({ cli: ["cli/**"], docs: ["docs/**", "!docs/wiki/**", "fern/**"] })).toEqual([
			{ name: "area:cli", color: AREA_LABEL_COLOR, description: "Changes under cli/**" },
			{ name: "area:docs", color: AREA_LABEL_COLOR, description: "Changes under docs/**, fern/**" },
		]);
	});

	it("cuts a description to GitHub's 100 characters", () => {
		const [label] = areaLabelDefs({ many: Array.from({ length: 30 }, (_, i) => `folder-${i}/**`) });
		expect(label!.description).toHaveLength(100);
		expect(label!.description.endsWith("…")).toBe(true);
	});

	it("makes none for no areas", () => {
		expect(areaLabelDefs(undefined)).toEqual([]);
		expect(areaLabelDefs({})).toEqual([]);
	});
});
