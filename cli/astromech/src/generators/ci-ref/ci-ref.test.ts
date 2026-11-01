import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REUSABLE_ACTIONS, REUSABLE_WORKFLOWS } from "../github-action-reusable-workflows/index.js";
import { WORKFLOW_TEMPLATES } from "../github-action-thin-callers/index.js";
import { CI_HOME, type CiHome, localize, rehome, rehomeAll, reusableWorkflowRef, TEMPLATE_HOME } from "./ci-ref.js";

const MOVED: CiHome = {
	workflows: "acme/central/.github/workflows",
	actions: "acme/central/ci/actions",
	ref: "ci-v1",
};

/** What a template spells today; only this module may. */
const LITERAL = "theholocron/.github/.github/";

describe("rehome", () => {
	it("moves a workflow reference and an action reference, keeping the name", () => {
		const text = [
			"uses: theholocron/.github/.github/workflows/verification.unitTests.yml@main",
			"uses: theholocron/.github/.github/actions/setup@main",
		].join("\n");
		expect(rehome(text, MOVED)).toBe(
			[
				"uses: acme/central/.github/workflows/verification.unitTests.yml@ci-v1",
				"uses: acme/central/ci/actions/setup@ci-v1",
			].join("\n")
		);
	});

	it("leaves a local action and any other text alone", () => {
		const text = "uses: ./.github/actions/setup\nuses: actions/checkout@v7\n# theholocron/.github is the org repo";
		expect(rehome(text, MOVED)).toBe(text);
	});

	it("is the identity while the home is the templates' own spelling", () => {
		const text = "uses: theholocron/.github/.github/workflows/stale.yml@main";
		expect(rehome(text)).toBe(text);
		expect(CI_HOME).toEqual(TEMPLATE_HOME);
	});

	it("rehomeAll keeps the keys", () => {
		expect(Object.keys(rehomeAll({ a: "x", b: "y" }, MOVED))).toEqual(["a", "b"]);
	});

	it("builds a reusable workflow reference", () => {
		expect(reusableWorkflowRef("preview.yml", MOVED)).toBe("acme/central/.github/workflows/preview.yml@ci-v1");
		expect(reusableWorkflowRef("preview.yml")).toBe("theholocron/.github/.github/workflows/preview.yml@main");
	});
});

describe("localize", () => {
	it("points a reference to a hosted workflow at the file in the same checkout", () => {
		expect(localize("    uses: theholocron/.github/.github/workflows/verification.unitTests.yml@main")).toBe(
			"    uses: ./.github/workflows/verification.unitTests.yml"
		);
		expect(localize("uses: acme/central/.github/workflows/stale.yml@ci-v1", MOVED)).toBe(
			"uses: ./.github/workflows/stale.yml"
		);
	});

	it("leaves a composite action on its full ref, since a called reusable cannot see this checkout", () => {
		const action = "uses: theholocron/.github/.github/actions/setup@main";
		expect(localize(action)).toBe(action);
	});

	it("leaves a reference to some other home alone", () => {
		const text = "uses: someone/else/.github/workflows/x.yml@main";
		expect(localize(text)).toBe(text);
	});

	it("rewrites every workflow reference of every caller, and none of its other lines", () => {
		const bad = Object.entries(WORKFLOW_TEMPLATES)
			.filter(([, text]) => {
				const local = localize(text);
				return local.includes(`${CI_HOME.workflows}/`) || local.split("\n").length !== text.split("\n").length;
			})
			.map(([name]) => name);
		expect(bad).toEqual([]);
	});
});

describe("every template can be rehomed", () => {
	const templates: Array<[string, string]> = [
		...Object.entries(WORKFLOW_TEMPLATES),
		...Object.entries(REUSABLE_WORKFLOWS),
		...Object.entries(REUSABLE_ACTIONS),
	];

	it("leaves no reference to the old home once moved, so none is spelled in a way rehome misses", () => {
		// While CI_HOME is the templates' own spelling, the built maps still hold it, so this moves it for real.
		const survivors = templates.filter(([, text]) => rehome(text, MOVED).includes(LITERAL));
		expect(survivors.map(([name]) => name)).toEqual([]);
	});

	it("covers enough templates for the check above to mean something", () => {
		expect(templates.length).toBeGreaterThan(50);
		expect(templates.filter(([, text]) => text.includes(CI_HOME.ref)).length).toBeGreaterThan(30);
	});
});

describe("no other source spells the old home", () => {
	const root = fileURLToPath(new URL("../..", import.meta.url));

	function* sources(dir: string): Generator<string> {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== "templates") yield* sources(path);
			} else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
				yield path;
			}
		}
	}

	it("keeps `theholocron/.github/.github/` out of every TypeScript source but ci-ref.ts", () => {
		const offenders = [...sources(root)]
			.filter((file) => !file.endsWith(join("ci-ref", "ci-ref.ts")))
			.filter((file) => readFileSync(file, "utf8").includes(LITERAL))
			.map((file) => relative(root, file));
		expect(offenders).toEqual([]);
	});
});
