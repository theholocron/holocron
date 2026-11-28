import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { generateThinCallerContent, WORKFLOW_TEMPLATES } from "../github-action-thin-callers.js";
import { groupedPublishCaller } from "./grouped-publish.js";

const base = WORKFLOW_TEMPLATES["release"]!;
const groups = ["utils", "clients"];
const on = () => groupedPublishCaller(base, groups, {}, true, true);

describe("the republish path (holocron#1387)", () => {
	it("adds nothing without `republish`", () => {
		const out = groupedPublishCaller(base, groups, {}, true);
		expect(out).not.toContain("republish");
		expect(out).not.toContain("exclude-groups");
	});

	it("offers a manual `republish_tag` string input, empty by default", () => {
		expect(on()).toContain("      republish_tag:\n        description: >\n");
		expect(on()).toContain('        required: false\n        default: ""\n        type: string\n');
	});

	it("hands the tag to every release, from a manual run only", () => {
		const line =
			"      republish-tag: ${{ github.event_name == 'workflow_dispatch' && inputs.republish_tag || '' }}\n";
		expect(on().split(line)).toHaveLength(3); // the group matrix and the ungrouped release
	});

	it("tells the ungrouped release which groups it leaves out", () => {
		expect(on()).toContain("      exclude-groups: utils clients\n");
	});

	it("refuses `all` with a tag in the plan job", () => {
		const out = on();
		expect(out).toContain("          REPUBLISH_TAG: ${{ inputs.republish_tag }}\n");
		expect(out).toContain('if [ -n "$REPUBLISH_TAG" ] && { [ -z "$GROUP" ] || [ "$GROUP" = "all" ]; }; then');
	});

	it("is switched on by `republish: true` in the task's `with`", () => {
		expect(generateThinCallerContent("release", { groups, ungrouped: true, republish: true })).toContain(
			"republish_tag:"
		);
		expect(generateThinCallerContent("release", { groups, ungrouped: true })).not.toContain("republish_tag");
	});

	describe("the plan script", () => {
		const jq = spawnSync("jq", ["--version"]).status === 0;
		const script = on()
			.split("        run: |\n")[1]!
			.split("\n\n")[0]!
			.split("\n")
			.map((line) => line.slice(10))
			.join("\n");
		const run = (group: string, tag: string) =>
			spawnSync("bash", ["-c", `set -eo pipefail\nGITHUB_OUTPUT=$(mktemp)\n${script}\ncat "$GITHUB_OUTPUT"`], {
				encoding: "utf8",
				env: { ...process.env, GROUP: group, REPUBLISH_TAG: tag, ALL_GROUPS: '[{"group":"utils"}]' },
			});

		it("fails for a tag with no group or with `all`", () => {
			for (const group of ["", "all"]) {
				const result = run(group, "utils-v1.0.0");
				expect(result.status).toBe(1);
				expect(result.stdout).toContain("republish_tag needs one group");
			}
		});

		it.skipIf(!jq)("plans the one group for a tag, and none for ungrouped", () => {
			expect(run("utils", "utils-v1.0.0").stdout).toContain('groups=[{"group":"utils"}]');
			expect(run("ungrouped", "v1.0.0").stdout).toContain("groups=[]");
		});

		it.skipIf(!jq)("a normal run with no tag is as before", () => {
			expect(run("all", "").stdout).toContain('groups=[{"group":"utils"}]');
		});
	});
});
