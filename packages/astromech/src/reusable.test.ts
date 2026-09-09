import { describe, expect, it } from "vitest";

import { REUSABLE_ACTIONS, REUSABLE_WORKFLOWS, reusableTemplates, WORKFLOW_TEMPLATE_PROPERTIES } from "./reusable.js";
import { baselineSuperLinterEnv } from "./super-linter.js";
import { WORKFLOW_TEMPLATES } from "./thin-callers.js";

describe("reusableTemplates()", () => {
	const batch = reusableTemplates();

	it("emits actions, reusable workflows, workflow-templates and their properties", () => {
		const expected =
			Object.keys(REUSABLE_ACTIONS).length +
			Object.keys(REUSABLE_WORKFLOWS).length +
			Object.keys(WORKFLOW_TEMPLATES).length +
			Object.keys(WORKFLOW_TEMPLATE_PROPERTIES).length;
		expect(batch.size).toBe(expected);

		for (const name of Object.keys(REUSABLE_ACTIONS)) {
			expect(batch.has(`.github/actions/${name}.yml`)).toBe(true);
		}
		for (const name of Object.keys(REUSABLE_WORKFLOWS)) {
			expect(batch.has(`.github/workflows/${name}.yml`)).toBe(true);
		}
		for (const name of Object.keys(WORKFLOW_TEMPLATES)) {
			expect(batch.has(`workflow-templates/${name}.yml`)).toBe(true);
		}
	});

	it("applies the do-not-edit header to YAML — no timestamp", () => {
		const lint = batch.get(".github/workflows/lint.yml")!;
		expect(lint.startsWith("# AUTO-GENERATED — do not edit in theholocron/.github directly.\n")).toBe(true);
		expect(lint).toContain("# Source:  theholocron/holocron · packages/astromech/src/reusable.ts");
		expect(lint).toContain("# Tool:    holocron sync-github");
		// A live `Synced:` timestamp would defeat sync-github's unchanged-file skip.
		expect(lint).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
		expect(lint).not.toContain("Synced:");
		// header, then the real workflow
		expect(lint).toContain("\nname: Lint\n");
	});

	it("leaves the starter-workflow .properties.json bare (native JSON, no header)", () => {
		const props = batch.get("workflow-templates/bookkeeping.properties.json")!;
		expect(props.startsWith("#")).toBe(false);
		expect(JSON.parse(props)).toMatchObject({ name: "Bookkeeping", iconName: "octicon tag" });
	});

	it("adds a .properties.json only for templates that have properties", () => {
		const propsKeys = [...batch.keys()].filter((k) => k.endsWith(".properties.json"));
		expect(propsKeys).toEqual(["workflow-templates/bookkeeping.properties.json"]);
	});
});

describe("REUSABLE_WORKFLOWS.lint — super-linter-env", () => {
	const lint = REUSABLE_WORKFLOWS["lint"]!;

	it("declares the super-linter-env input and expands it, not file detection", () => {
		expect(lint).toMatch(/^ {6}super-linter-env:$/m);
		expect(lint).toContain("Expand linter matrix");
		expect(lint).not.toContain("Detect project features");
	});

	it("no longer hard-codes the always-on VALIDATE_* block in the super-linter step", () => {
		const superLinterEnv = lint.slice(lint.indexOf("Run Super Linter"));
		expect(superLinterEnv).not.toContain("# Always-on linters");
	});

	it("the input default is the astromech always-on baseline", () => {
		const raw = lint.match(/super-linter-env:[\s\S]*?default: >-\n([\s\S]*?)\n {4}secrets:/)?.[1];
		expect(raw).toBeDefined();
		const parsed = JSON.parse(raw!.replace(/\n\s+/g, "")) as Record<string, string>;
		expect(Object.keys(parsed).sort()).toEqual(Object.keys(baselineSuperLinterEnv()).sort());
		expect(Object.values(parsed).every((v) => v === "true")).toBe(true);
	});
});
