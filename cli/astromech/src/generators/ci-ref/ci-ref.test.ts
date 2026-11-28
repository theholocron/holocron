import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REUSABLE_ACTIONS, REUSABLE_WORKFLOWS } from "../github-action-reusable-workflows/index.js";
import { WORKFLOW_TEMPLATES } from "../github-action-thin-callers/index.js";
import {
	CI_HOME,
	CI_TARGET,
	type CiHome,
	DEFAULT_ORG,
	DOT_GITHUB_REPO,
	HOLOCRON_REPO,
	legacyGate,
	localize,
	localizeActions,
	rehome,
	rehomeAll,
	reusableWorkflowRef,
	TEMPLATE_HOME,
} from "./ci-ref.js";

const MOVED: CiHome = {
	workflows: "acme/central/.github/workflows",
	actions: "acme/central/ci/actions",
	ref: "ci-v1",
};

/** What a template spells today; only this module may. */
const LITERAL = "theholocron/.github/.github/";

describe("the org coordinates", () => {
	it("are built from the one org slug", () => {
		expect(DEFAULT_ORG).toBe("theholocron");
		expect(DOT_GITHUB_REPO).toBe("theholocron/.github");
		expect(HOLOCRON_REPO).toBe("theholocron/holocron");
	});

	it("are what the template and target homes spell", () => {
		expect(TEMPLATE_HOME.workflows).toBe(`${DOT_GITHUB_REPO}/.github/workflows`);
		expect(TEMPLATE_HOME.actions).toBe(`${DOT_GITHUB_REPO}/.github/actions`);
		expect(CI_TARGET.workflows).toBe(`${HOLOCRON_REPO}/.github/workflows`);
		expect(CI_TARGET.actions).toBe(`${HOLOCRON_REPO}/ci/actions`);
	});
});

describe("legacyGate", () => {
	it("holds while the callers call the frozen reusables on main, and opens at ci-v1", () => {
		expect(legacyGate()).toBe(true);
		expect(legacyGate(TEMPLATE_HOME)).toBe(true);
		expect(legacyGate(MOVED)).toBe(false);
	});
});

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

	it("spells a flat reusable with its old file name at a `main` home, where only the frozen copies exist", () => {
		const text = "uses: theholocron/.github/.github/workflows/test-unit.yml@main";
		expect(rehome(text, TEMPLATE_HOME)).toBe(
			"uses: theholocron/.github/.github/workflows/verification.unitTests.yml@main"
		);
		expect(rehome("uses: theholocron/.github/.github/workflows/preview.yml@main", TEMPLATE_HOME)).toBe(
			"uses: theholocron/.github/.github/workflows/preview.yml@main"
		);
	});

	it("keeps the flat file name at `ci-v1`, so no dotted legacy name carries that tag", () => {
		const text = "uses: theholocron/.github/.github/workflows/test-unit.yml@main";
		expect(rehome(text, { ...MOVED, ref: "ci-v1" })).toBe(
			"uses: acme/central/.github/workflows/test-unit.yml@ci-v1"
		);
	});

	it("leaves no dotted legacy name in what a hosting repo calls", () => {
		const calls = Object.values(WORKFLOW_TEMPLATES).flatMap(
			(text) => localize(text).match(/workflows\/[\w.-]+/g) ?? []
		);
		expect(calls.length).toBeGreaterThan(20);
		expect(calls.filter((call) => /^workflows\/[\w-]+\.[\w-]+\.yml$/.test(call))).toEqual([]);
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

	it("builds a reusable workflow reference from the flat name, old at `main`", () => {
		expect(reusableWorkflowRef("deploy.yml")).toBe(
			"theholocron/.github/.github/workflows/delivery.deploy.yml@main"
		);
		expect(reusableWorkflowRef("deploy.yml", MOVED)).toBe("acme/central/.github/workflows/deploy.yml@ci-v1");
	});

	it("builds a reusable workflow reference", () => {
		expect(reusableWorkflowRef("preview.yml", MOVED)).toBe("acme/central/.github/workflows/preview.yml@ci-v1");
		expect(reusableWorkflowRef("preview.yml")).toBe("theholocron/.github/.github/workflows/preview.yml@main");
	});
});

describe("localizeActions", () => {
	it("points a named action at its folder in the same checkout", () => {
		const text = "        uses: theholocron/.github/.github/actions/codecov-upload@main\n";
		expect(localizeActions(text, ["codecov-upload"])).toBe("        uses: ./ci/actions/codecov-upload\n");
	});

	it("rewrites every use of it and leaves the actions it is not asked about on their full ref", () => {
		const text = [
			"- uses: theholocron/.github/.github/actions/setup@main",
			"- uses: theholocron/.github/.github/actions/codecov-upload@main",
			"- uses: theholocron/.github/.github/actions/codecov-upload@main",
		].join("\n");
		expect(localizeActions(text, ["codecov-upload"])).toBe(
			[
				"- uses: theholocron/.github/.github/actions/setup@main",
				"- uses: ./ci/actions/codecov-upload",
				"- uses: ./ci/actions/codecov-upload",
			].join("\n")
		);
	});

	it("reads the reference at the home it is given, so it still works once the files move", () => {
		const text = "uses: acme/central/ci/actions/codecov-upload@ci-v1";
		expect(localizeActions(text, ["codecov-upload"], MOVED)).toBe("uses: ./ci/actions/codecov-upload");
		expect(localizeActions(text, ["codecov-upload"])).toBe(text);
	});

	it("changes nothing without a name", () => {
		const text = "uses: theholocron/.github/.github/actions/codecov-upload@main";
		expect(localizeActions(text, [])).toBe(text);
	});
});

describe("localize", () => {
	it("points a reference to a hosted workflow at the file in the same checkout", () => {
		expect(localize("    uses: theholocron/.github/.github/workflows/test-unit.yml@main")).toBe(
			"    uses: ./.github/workflows/test-unit.yml"
		);
		expect(localize("uses: acme/central/.github/workflows/mark-stale.yml@ci-v1", MOVED)).toBe(
			"uses: ./.github/workflows/mark-stale.yml"
		);
	});

	it("names the flat file whichever spelling the reference has, since the hosted reusables have only flat names", () => {
		expect(localize("uses: theholocron/.github/.github/workflows/verification.unitTests.yml@main")).toBe(
			"uses: ./.github/workflows/test-unit.yml"
		);
		expect(localize("uses: theholocron/.github/.github/workflows/preview.yml@main")).toBe(
			"uses: ./.github/workflows/preview.yml"
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
