import { describe, expect, it } from "vitest";

import { areaLabelsForTitle } from "./area-labels-for-title.js";

const SCOPES = { sentinel: "sentinel", cli: "cli", astromech: "cli" };

describe("areaLabelsForTitle", () => {
	it("labels the area of the title's scope", () => {
		expect(areaLabelsForTitle("feat(sentinel): add", SCOPES)).toEqual(["area:sentinel"]);
	});

	it("gives an area once when two scopes mean it", () => {
		expect(areaLabelsForTitle("fix(cli, astromech, sentinel): x", SCOPES)).toEqual(["area:cli", "area:sentinel"]);
	});

	it("gives nothing for no scope, an unmapped scope or no map", () => {
		expect(areaLabelsForTitle("feat: add", SCOPES)).toEqual([]);
		expect(areaLabelsForTitle("feat(env): add", SCOPES)).toEqual([]);
		expect(areaLabelsForTitle("feat(cli): add", undefined)).toEqual([]);
	});
});
