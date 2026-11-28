import { describe, expect, it } from "vitest";

import { groupedPublishCaller } from "../../generators/github-action-thin-callers/grouped-publish/index.js";
import {
	generateCombinedDeployContent,
	WORKFLOW_TEMPLATES,
} from "../../generators/github-action-thin-callers/index.js";
import { LEGACY_CALLERS } from "../legacy-callers/index.js";
import { legacyCaller } from "./legacy-caller.js";

describe("legacyCaller", () => {
	it("gives a caller back its old workflow, job id and job name", () => {
		const out = legacyCaller("test:unit", WORKFLOW_TEMPLATES["test:unit"]!);
		expect(out).toMatch(/^name: Verification$/m);
		expect(out).toMatch(/^ {2}test:\n {4}name: Test\n {4}uses: /m);
		expect(out).not.toContain("test-unit:");
		expect(out).not.toContain("test:unit\n");
	});

	it("drops the job name of a job that had none", () => {
		const out = legacyCaller("mark-stale", WORKFLOW_TEMPLATES["mark-stale"]!);
		expect(out).toMatch(/^name: Stale$/m);
		expect(out).toMatch(/^ {2}stale:\n {4}uses: /m);
	});

	it("renames each job of a caller with two", () => {
		const out = legacyCaller("publish-wiki", WORKFLOW_TEMPLATES["publish-wiki"]!);
		expect(out).toMatch(/^name: Knowledge$/m);
		expect(out).toMatch(/^ {2}publish:\n {4}name: Publish\n/m);
		expect(out).toMatch(/^ {2}preview:\n {4}name: Preview\n/m);
	});

	it("names the combined deploy caller as it was, and the plain one", () => {
		const combined = legacyCaller("deploy", generateCombinedDeployContent({}, [], { project: "p" }, "deploy"));
		expect(combined).toMatch(/^name: Deploy$/m);
		expect(combined).toMatch(/^ {2}deploy:\n {4}name: Deploy\n/m);
		expect(combined).toMatch(/^ {2}preview:\n {4}name: Preview\n/m);
		const docs = legacyCaller(
			"deploy-docs",
			generateCombinedDeployContent({}, [], { project: "p" }, "deploy-docs")
		);
		expect(docs).toMatch(/^name: Deploy$/m);
		expect(docs).toMatch(/^ {2}preview:\n {4}name: Preview\n/m);
		const plain = legacyCaller("deploy", WORKFLOW_TEMPLATES["deploy"]!);
		expect(plain).toMatch(/^name: Delivery$/m);
		expect(plain).toMatch(/^ {2}deploy:\n {4}name: Deploy\n/m);
	});

	it("leaves a name the caller built itself to the entry's replacement (the grouped release's matrix name)", () => {
		const grouped = groupedPublishCaller(WORKFLOW_TEMPLATES["release"]!, ["utils"], {});
		const out = legacyCaller("release", grouped);
		expect(out).toMatch(/^name: Delivery$/m);
		expect(out).toContain("    name: Release ${{ matrix.group }}\n");
		expect(out).toMatch(/^ {2}plan:\n {4}name: Plan\n/m);
		const ungrouped = legacyCaller(
			"release",
			groupedPublishCaller(WORKFLOW_TEMPLATES["release"]!, ["utils"], {}, true)
		);
		expect(ungrouped).toMatch(/^ {2}release:\n {4}name: Release\n/m);
		expect(ungrouped).toMatch(/^ {2}release-groups:\n {4}name: Release \$\{\{ matrix\.group \}\}\n/m);
	});

	it("returns an id with no old spelling as it is", () => {
		expect(legacyCaller("ci", "name: ci\n")).toBe("name: ci\n");
	});

	it("has an entry for every template, naming each of its jobs", () => {
		expect(Object.keys(WORKFLOW_TEMPLATES).filter((id) => !(id in LEGACY_CALLERS))).toEqual([]);
		for (const [id, legacy] of Object.entries(LEGACY_CALLERS)) {
			const template = WORKFLOW_TEMPLATES[id];
			// the generated deploy callers have a second job (the preview) that the plain template does not
			if (template === undefined || ["deploy", "deploy-docs", "deploy-components"].includes(id)) continue;
			for (const job of Object.keys(legacy.jobs)) expect(template, `${id}: ${job}`).toContain(`\n  ${job}:\n`);
		}
	});
});
