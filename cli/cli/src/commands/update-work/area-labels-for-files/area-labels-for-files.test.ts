import { describe, expect, it } from "vitest";

import { areaLabelsForFiles } from "./area-labels-for-files.js";

const AREAS = {
	cli: ["cli/**"],
	docs: ["docs/**", "!docs/wiki/**", "fern/**"],
	specs: ["docs/wiki/**", ".notes/**"],
	tooling: ["holocron.config.ts", ".holocron"],
};

describe("areaLabelsForFiles", () => {
	it("labels each area a path falls in, in declared order", () => {
		expect(areaLabelsForFiles(["docs/a.md", "cli/cli/a.ts"], AREAS)).toEqual(["area:cli", "area:docs"]);
	});

	it("lets an exclusion move a path to the area that owns it", () => {
		expect(areaLabelsForFiles(["docs/wiki/specifications/x.md"], AREAS)).toEqual(["area:specs"]);
	});

	it("labels the root config files as tooling", () => {
		expect(areaLabelsForFiles(["holocron.config.ts", ".holocron/repo.ts"], AREAS)).toEqual(["area:tooling"]);
	});

	it("gives nothing for a path in no area or a repo with no areas", () => {
		expect(areaLabelsForFiles(["package.json"], AREAS)).toEqual([]);
		expect(areaLabelsForFiles(["cli/a.ts"], undefined)).toEqual([]);
		expect(areaLabelsForFiles([], AREAS)).toEqual([]);
	});
});
