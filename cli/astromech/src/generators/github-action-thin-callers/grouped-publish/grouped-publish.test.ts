import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { generateThinCallerContent, normalizeWorkflowWith, WORKFLOW_TEMPLATES } from "../github-action-thin-callers.js";
import { groupedPublishCaller } from "./grouped-publish.js";

const base = WORKFLOW_TEMPLATES["delivery.publish"]!;
const caller = (groups: unknown, shared: Record<string, unknown> = {}) => groupedPublishCaller(base, groups, shared);

describe("groupedPublishCaller", () => {
	it("calls the reusable once per group, one group at a time, without stopping at the first failure", () => {
		const out = caller(["utils", "clients"]);
		expect(out).toContain("    needs: plan\n");
		expect(out).toContain("      fail-fast: false\n      max-parallel: 1\n");
		expect(out).toContain("        include: ${{ fromJSON(needs.plan.outputs.groups) }}\n");
		expect(out).toContain("    uses: theholocron/.github/.github/workflows/delivery.publish.yml@main\n");
		expect(out).toContain("    name: Release ${{ matrix.group }}\n");
		expect(out).toContain("      group: ${{ matrix.group }}\n");
		expect(out.endsWith("    secrets: inherit\n")).toBe(true);
	});

	it("keeps the plain caller's triggers, permissions, concurrency and dry-run input", () => {
		const out = caller(["utils"]);
		const head = base.slice(0, base.indexOf("jobs:\n"));
		for (const line of head.split("\n").filter(Boolean)) expect(out).toContain(line);
		expect(out).toContain("      dry-run: ${{ inputs.dry_run == true }}\n");
	});

	it("offers each group, and all of them, as the manual run's choice", () => {
		const out = caller(["utils", { name: "cli" }]);
		expect(out).toContain(
			"      group:\n        description: >\n          Release one version group instead of all of them. Push-triggered\n" +
				"          runs always release every group.\n        required: false\n        default: all\n        type: choice\n" +
				"        options:\n          - all\n          - utils\n          - cli\n"
		);
	});

	it("lists the groups for the plan job, a plain name being just { group }", () => {
		const out = caller(["utils", { name: "cli", "sentry-project": "holocron-cli" }]);
		expect(out).toContain(`ALL_GROUPS: '[{"group":"utils"},{"group":"cli","sentry-project":"holocron-cli"}]'`);
	});

	it("passes an input a group sets for itself from the matrix: booleans compared, strings as they are", () => {
		const out = caller(["utils", { name: "cli", "sentry-project": "holocron-cli", "deploy-on-release": true }]);
		expect(out).toContain("      deploy-on-release: ${{ matrix.deploy-on-release == true }}\n");
		expect(out).toContain("      sentry-project: ${{ matrix.sentry-project }}\n");
	});

	it("passes inputs for every group as constants", () => {
		const out = caller(["utils"], { "post-release": false, "run-build": true });
		expect(out).toContain("      post-release: false\n      run-build: true\n");
		expect(out).not.toContain("matrix.post-release");
	});

	it("does not set an input no group sets", () => {
		expect(caller(["utils"])).not.toMatch(/matrix\.(sentry-project|deploy-on-release|post-release|run-build)/);
	});

	it("escapes a single quote in the group list for the YAML scalar", () => {
		expect(caller([{ name: "cli", "sentry-project": "it's" }])).toContain(`"sentry-project":"it''s"`);
	});

	describe("rejects", () => {
		it.each([
			["no groups", []],
			["a non-list", "utils"],
			["a name that cannot be a tag prefix", ["Utils"]],
			["a path", ["a/b"]],
			["an entry with no name", [{ "sentry-project": "x" }]],
			["a non-string, non-object entry", [3]],
			["a null entry", [null]],
		])("%s", (_label, groups) => {
			expect(() => caller(groups)).toThrow(TypeError);
		});

		it("a group listed twice", () => {
			expect(() => caller(["utils", "utils"])).toThrow(/listed twice/);
		});

		it("an input that is not per-group, naming the ones that are", () => {
			expect(() => caller([{ name: "utils", "dry-run": true }])).toThrow(/"dry-run".*deploy-on-release/);
		});

		it("an input value that is not a string or a boolean", () => {
			expect(() => caller([{ name: "utils", "run-build": 1 }])).toThrow(/string or a boolean/);
		});

		it("an input set both for every group and for a group", () => {
			expect(() => caller([{ name: "cli", "sentry-project": "a" }], { "sentry-project": "b" })).toThrow(
				/sentry-project is set both/
			);
		});
	});
});

describe("generateThinCallerContent for delivery.publish", () => {
	it("is unchanged without groups", () => {
		expect(generateThinCallerContent("delivery.publish")).toBe(base);
		expect(generateThinCallerContent("delivery.publish", { "sentry-project": "x" })).toContain(
			"      sentry-project: x\n    secrets: inherit\n"
		);
		expect(generateThinCallerContent("delivery.publish", { "sentry-project": "x" })).not.toContain("matrix");
	});

	it("switches to the grouped caller when `groups` is set, keeping the other with: values for every group", () => {
		const out = generateThinCallerContent(
			"delivery.publish",
			normalizeWorkflowWith({ groups: ["utils", "clients"], "post-release": true })
		);
		expect(out).toContain("fromJSON(needs.plan.outputs.groups)");
		expect(out).toContain("      post-release: true\n");
	});

	it("does not treat groups on another workflow specially", () => {
		expect(generateThinCallerContent("verification.unitTests", { groups: "x" })).not.toContain("plan:");
	});
});

describe("normalizeWorkflowWith", () => {
	it("keeps `groups` a list for the grouped caller, and still stringifies other lists", () => {
		const out = normalizeWorkflowWith({ groups: ["a", "b"], other: ["x"] });
		expect(out["groups"]).toEqual(["a", "b"]);
		expect(out["other"]).toBe('["x"]');
	});
});

describe("the plan job's script", () => {
	const jq = spawnSync("jq", ["--version"]).status === 0;
	const script = (out: string) =>
		out
			.split("        run: |\n")[1]!
			.split("\n\n")[0]!
			.split("\n")
			.map((line) => line.slice(10))
			.join("\n");

	function plan(group: string) {
		const out = caller(["utils", { name: "cli", "sentry-project": "holocron-cli" }, "observability"]);
		const all = /ALL_GROUPS: '(.*)'/.exec(out)![1]!;
		const run = spawnSync(
			"bash",
			["-c", `set -eo pipefail\nGITHUB_OUTPUT=$(mktemp)\n${script(out)}\ncat "$GITHUB_OUTPUT"`],
			{
				encoding: "utf8",
				env: { ...process.env, GROUP: group, ALL_GROUPS: all },
			}
		);
		if (run.status !== 0) throw new Error(`plan script exited ${run.status}: ${run.stderr}`);
		return JSON.parse(run.stdout.replace(/^groups=/, "")) as { group: string }[];
	}

	it.skipIf(!jq)("releases every group for a push (no group input) or `all`", () => {
		expect(plan("").map((g) => g.group)).toEqual(["utils", "cli", "observability"]);
		expect(plan("all").map((g) => g.group)).toEqual(["utils", "cli", "observability"]);
	});

	it.skipIf(!jq)("releases only the chosen group, with its own inputs", () => {
		expect(plan("cli")).toEqual([{ group: "cli", "sentry-project": "holocron-cli" }]);
		expect(plan("utils")).toEqual([{ group: "utils" }]);
	});
});
