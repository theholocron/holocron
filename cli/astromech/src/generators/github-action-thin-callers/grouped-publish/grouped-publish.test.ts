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
				"          runs always release everything.\n        required: false\n        default: all\n        type: choice\n" +
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

	it("names a boolean input in every matrix entry, with the reusable's default for a group that omits it", () => {
		// `matrix.run-build == true` is false for an entry without the key, which would turn off the build the
		// reusable runs by default for every group that did not ask to skip it.
		const out = caller(["utils", { name: "ci", "run-build": false }]);
		expect(out).toContain(`ALL_GROUPS: '[{"group":"utils","run-build":true},{"group":"ci","run-build":false}]'`);
		const matrix = (JSON.parse(/ALL_GROUPS: '(.*)'/.exec(out)![1]!) as Array<Record<string, unknown>>).map(
			(entry) => entry["run-build"] == true
		);
		expect(matrix).toEqual([true, false]);
		const other = caller([{ name: "utils", "post-release": true }, "clients"]);
		expect(other).toContain(`[{"group":"utils","post-release":true},{"group":"clients","post-release":false}]`);
	});

	it("escapes a single quote in the group list for the YAML scalar", () => {
		expect(caller([{ name: "cli", "sentry-project": "it's" }])).toContain(`"sentry-project":"it''s"`);
	});

	describe("with an ungrouped release", () => {
		const out = () =>
			groupedPublishCaller(
				base,
				["observability", { name: "skills", "run-build": false }],
				{ "post-release": false },
				{
					"sentry-project": "holocron-cli",
					"deploy-on-release": true,
				}
			);

		const matrixJob = () => out().slice(out().indexOf("  release-groups:"), out().indexOf("  release:\n"));
		const ungroupedJob = () => out().slice(out().indexOf("  release:\n"));

		it("releases the packages in no group last, under the repo's own tags and without a group", () => {
			const release = ungroupedJob();
			expect(out().indexOf("  release-groups:")).toBeLessThan(out().indexOf("  release:\n"));
			expect(release).toContain("    name: Release\n");
			expect(release).toContain("uses: theholocron/.github/.github/workflows/delivery.publish.yml@main");
			expect(release).not.toContain("group:");
			expect(release).not.toContain("matrix");
			expect(release.trimEnd().endsWith("secrets: inherit")).toBe(true);
		});

		it("gives that release its own inputs and the shared ones, but not the groups' per-group ones", () => {
			const release = ungroupedJob();
			expect(release).toContain("      sentry-project: holocron-cli\n      deploy-on-release: true\n");
			expect(release).toContain("      post-release: false\n");
			expect(release).not.toContain("run-build");
		});

		it("keeps the Sentry and deploy settings off the groups' releases", () => {
			const matrix = matrixJob();
			expect(matrix).not.toContain("sentry-project");
			expect(matrix).not.toContain("deploy-on-release");
			expect(matrix).toContain("      run-build: ${{ matrix.run-build == true }}\n");
		});

		it("runs the groups first, one at a time, without waiting for the ungrouped release", () => {
			const matrix = matrixJob();
			expect(matrix).toContain("    needs: plan\n");
			expect(matrix).not.toContain("needs: [plan, release]");
			expect(matrix).toContain("      max-parallel: 1\n");
		});

		it("skips the groups' release when a manual run picked `ungrouped`, which leaves the plan empty and would fail the matrix", () => {
			expect(matrixJob()).toContain("    if: ${{ needs.plan.outputs.groups != '[]' }}\n");
		});

		it("starts the ungrouped release from the branch tip, which the groups' release commits have moved", () => {
			expect(ungroupedJob()).toContain("      from-branch-tip: true\n");
			expect(matrixJob()).not.toContain("from-branch-tip");
		});

		it("runs the ungrouped release after the groups, even when they were skipped, but not when one failed", () => {
			const release = ungroupedJob();
			expect(release).toContain("    needs: [plan, release-groups]\n");
			expect(release).toContain("!cancelled()");
			expect(release).toContain("needs.release-groups.result != 'failure'");
		});

		it("lets a manual run pick the ungrouped release, which a group choice skips", () => {
			expect(out()).toContain(
				"          - all\n          - ungrouped\n          - observability\n          - skills\n"
			);
			expect(ungroupedJob()).toContain(
				"(inputs.group == '' || inputs.group == 'all' || inputs.group == 'ungrouped')"
			);
		});

		it("accepts `true` for an ungrouped release with no inputs of its own", () => {
			const plain = groupedPublishCaller(base, ["observability"], {}, true);
			expect(plain).toContain("  release-groups:");
			expect(plain).toContain(
				"      dry-run: ${{ inputs.dry_run == true }}\n      from-branch-tip: true\n    secrets: inherit"
			);
		});

		it("is absent unless asked for: the matrix job keeps the id `release`", () => {
			for (const flag of [undefined, false]) {
				const without = groupedPublishCaller(base, ["observability"], {}, flag);
				expect(without).toContain("  release:\n    name: Release ${{ matrix.group }}");
				expect(without).not.toContain("release-groups");
				expect(without).not.toContain("- ungrouped");
			}
		});
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
			expect(() => caller([{ name: "utils", "dry-run": true }])).toThrow(
				/"dry-run".*per-release.*deploy-on-release/
			);
		});

		it("an input value that is not a string or a boolean", () => {
			expect(() => caller([{ name: "utils", "run-build": 1 }])).toThrow(/string or a boolean/);
		});

		it.each([["all"], ["ungrouped"]])("the reserved group name %s", (name) => {
			expect(() => caller([name])).toThrow(/not "all" or "ungrouped"/);
		});

		it.each([["yes"], [["x"]], [3]])("an `ungrouped` that is not true or an object (%j)", (value) => {
			expect(() => groupedPublishCaller(base, ["a"], {}, value)).toThrow(/ungrouped.*true, or an object/);
		});

		it("an input the ungrouped release cannot set for itself", () => {
			expect(() => groupedPublishCaller(base, ["a"], {}, { "dry-run": true })).toThrow(
				/`ungrouped` sets "dry-run"/
			);
		});

		it("an input set both for every release and for the ungrouped one", () => {
			expect(() =>
				groupedPublishCaller(base, ["a"], { "sentry-project": "x" }, { "sentry-project": "y" })
			).toThrow(/sentry-project is set both/);
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

	it("takes `ungrouped` as the repo-wide release's own inputs rather than passing it on to the reusable", () => {
		const out = generateThinCallerContent(
			"delivery.publish",
			normalizeWorkflowWith({ groups: ["utils"], ungrouped: { "sentry-project": "holocron-cli" } })
		);
		expect(out).toContain("  release-groups:");
		expect(out).toContain("      sentry-project: holocron-cli\n");
		expect(out).not.toContain("ungrouped:");
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
