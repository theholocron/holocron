import { describe, expect, it } from "vitest";

import { MAX_AREA_LABELS, planAreaLabels } from "./plan-area-labels.js";

const AREAS = {
	cli: ["cli/**"],
	sentinel: ["apps/sentinel/**"],
	docs: ["docs/**", "!docs/wiki/**"],
	specs: ["docs/wiki/**", ".notes/**"],
	ci: ["ci/**"],
	plugins: ["plugins/**"],
};
const SCOPES = { sentinel: "sentinel", cli: "cli", specs: "specs" };
const ALL = Object.keys(AREAS).map((a) => `area:${a}`);

const plan = (over: Partial<Parameters<typeof planAreaLabels>[0]> = {}) =>
	planAreaLabels({ areas: AREAS, scopes: SCOPES, title: "chore: x", existing: [], repoLabels: ALL, ...over });

describe("planAreaLabels", () => {
	it("adds the area of each folder a pull request changes", () => {
		expect(plan({ files: ["cli/cli/src/a.ts", "apps/sentinel/src/b.ts"] })).toEqual({
			add: ["area:cli", "area:sentinel"],
			missing: [],
			dropped: [],
		});
	});

	it("puts the most-changed folder first, ties in declaration order", () => {
		expect(plan({ files: ["apps/sentinel/a.ts", "cli/b.ts", "apps/sentinel/c.ts"] }).add).toEqual([
			"area:sentinel",
			"area:cli",
		]);
		expect(plan({ files: ["ci/a.yml", "cli/b.ts"] }).add).toEqual(["area:cli", "area:ci"]);
	});

	it("lets the title's scopes add to the files' areas, without repeating one", () => {
		expect(plan({ files: ["cli/a.ts"], title: "feat(cli, sentinel): x" }).add).toEqual([
			"area:cli",
			"area:sentinel",
		]);
	});

	it("takes an issue's areas from its title alone", () => {
		expect(plan({ title: "feat(sentinel): x" })).toEqual({ add: ["area:sentinel"], missing: [], dropped: [] });
		expect(plan({ title: "no scope here" }).add).toEqual([]);
	});

	it("adds nothing for a pull request that touches no declared folder", () => {
		expect(plan({ files: ["package.json"] })).toEqual({ add: [], missing: [], dropped: [] });
	});

	it("never adds what the item has, whatever the case, and never removes anything", () => {
		const result = plan({ files: ["cli/a.ts", "ci/b.yml"], existing: ["AREA:CLI", "bug", "area:docs"] });
		expect(result.add).toEqual(["area:ci"]);
		expect(result).not.toHaveProperty("remove");
	});

	it("reports a wanted label the repository lacks and never counts it against the cap", () => {
		const result = plan({ files: ["cli/a.ts", "ci/b.yml"], repoLabels: ["Area:CI"] });
		expect(result).toEqual({ add: ["area:ci"], missing: ["area:cli"], dropped: [] });
	});

	it("keeps at most the cap, counting the labels a person put there, and names what it left out", () => {
		expect(MAX_AREA_LABELS).toBe(4);
		const files = ["cli/a", "apps/sentinel/a", "docs/a", "docs/wiki/a", "ci/a", "plugins/a"];
		const result = plan({ files });
		expect(result.add).toHaveLength(4);
		expect(result.dropped).toEqual(["area:ci", "area:plugins"]);
		const crowded = plan({ files: ["cli/a", "ci/a"], existing: ["area:docs", "area:specs", "area:plugins"] });
		expect(crowded.add).toEqual(["area:cli"]);
		expect(crowded.dropped).toEqual(["area:ci"]);
	});

	it("lets a title's scope fill only the room the diff left", () => {
		const files = ["cli/a", "apps/sentinel/a", "docs/a", "ci/a"];
		const result = plan({ files, title: "docs(specs): x" });
		expect(result.add).toEqual(["area:cli", "area:sentinel", "area:docs", "area:ci"]);
		expect(result.dropped).toEqual(["area:specs"]);
	});

	it("is a no-op when everything wanted is there", () => {
		expect(plan({ files: ["cli/a.ts"], existing: ["area:cli"] })).toEqual({ add: [], missing: [], dropped: [] });
	});
});
