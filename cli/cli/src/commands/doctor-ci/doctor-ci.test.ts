import { describe, expect, it, vi } from "vitest";

import { aggregateRow } from "./aggregate-row.js";
import { callerProblems } from "./caller-problems.js";
import { callersRow } from "./callers-row.js";
import { runDoctorCi } from "./doctor-ci.js";
import type { CiIo, ParsedCaller, RunDoctorCiInput } from "./doctor-ci.type.js";
import { homeOf } from "./home-of.js";
import { homeRow } from "./home-row.js";
import { parseCaller } from "./parse-caller.js";
import { parseList } from "./parse-list.js";
import { tasksRow } from "./tasks-row.js";
import { unquote } from "./unquote.js";

const LEGACY_HOME = "theholocron/.github/.github/workflows";
const FLAT_HOME = "theholocron/holocron/.github/workflows";

interface Spec {
	name?: string;
	jobs: { id: string; name?: string; uses: string }[];
	expected?: string[];
	generated?: boolean;
}

/** The text of a generated caller, in the shape the generator writes. */
function text({ name, jobs, expected, generated = true }: Spec): string {
	return [
		generated ? "# AUTO-GENERATED — do not edit directly." : "# written by hand",
		"",
		...(name === undefined ? [] : [`name: ${name}`]),
		"",
		"on:",
		"  pull_request:",
		"",
		"jobs:",
		...jobs.flatMap((job) => [
			`  ${job.id}:`,
			...(job.name === undefined ? [] : [`    name: ${job.name}`]),
			`    uses: ${job.uses}`,
			...(expected === undefined ? [] : ["    with:", `      expected: '${JSON.stringify(expected)}'`]),
		]),
		"",
	].join("\n");
}

const flat = (id: string, uses = "./.github/workflows/x.yml"): Spec => ({
	name: id,
	jobs: [{ id: id.replaceAll(":", "-"), name: id, uses }],
});

const caller = (file: string, spec: Spec): ParsedCaller => parseCaller(file, text(spec))!;

describe("small helpers", () => {
	it("unquote strips one pair of quotes", () => {
		expect(unquote(' "a" ')).toBe("a");
		expect(unquote("'b'")).toBe("b");
		expect(unquote("c")).toBe("c");
	});

	it("parseList reads a JSON array of strings and nothing else", () => {
		expect(parseList('["a","b",1]')).toEqual(["a", "b"]);
		expect(parseList('{"a":1}')).toEqual([]);
		expect(parseList("not json")).toEqual([]);
	});

	it("homeOf tells the four homes apart", () => {
		expect(homeOf("./.github/workflows/x.yml")).toBe("local");
		expect(homeOf(`${LEGACY_HOME}/Verification.yml@main`)).toBe("legacy");
		expect(homeOf(`${FLAT_HOME}/test-unit.yml@ci-v1`)).toBe("ci-v1");
		expect(homeOf(`${FLAT_HOME}/test-unit.yml@main`)).toBe("other");
		expect(homeOf("someone/else/.github/workflows/x.yml@v1")).toBe("other");
	});
});

describe("parseCaller", () => {
	it("reads the workflow name, the jobs that call a reusable and the aggregate's expected list", () => {
		const parsed = parseCaller(
			"ci.ci.yml",
			text({
				name: "ci",
				jobs: [{ id: "ci", name: '"ci"', uses: "./.github/workflows/ci.yml" }],
				expected: ["a", "b"],
			})
		);
		expect(parsed).toEqual({
			file: "ci.ci.yml",
			name: "ci",
			jobs: [{ id: "ci", name: "ci", uses: "./.github/workflows/ci.yml" }],
			expected: ["a", "b"],
		});
	});

	it("leaves out a name or a job name the file does not have", () => {
		const parsed = parseCaller("a.yml", text({ jobs: [{ id: "a", uses: "./u.yml" }] }));
		expect(parsed).toEqual({ file: "a.yml", jobs: [{ id: "a", uses: "./u.yml" }] });
	});

	it("keeps only the jobs that call a reusable", () => {
		const body = `${text({ name: "release", jobs: [{ id: "a", name: "A", uses: "./u.yml" }] })}  plan:\n    name: Plan\n    runs-on: x\n`;
		expect(parseCaller("r.yml", body)?.jobs.map((j) => j.id)).toEqual(["a"]);
	});

	it("ignores a name or uses line that is under no job", () => {
		const body = "# AUTO-GENERATED\njobs:\n    name: stray\n    uses: stray.yml\n";
		expect(parseCaller("a.yml", body)).toBeUndefined();
	});

	it("is undefined without the header, without jobs or without a caller job", () => {
		expect(parseCaller("a.yml", text({ ...flat("build"), generated: false }))).toBeUndefined();
		expect(parseCaller("a.yml", "# AUTO-GENERATED\nname: x\n")).toBeUndefined();
		expect(parseCaller("a.yml", "# AUTO-GENERATED\njobs:\n  a:\n    runs-on: x\n")).toBeUndefined();
	});
});

describe("tasksRow", () => {
	it("passes flat ids", () => {
		expect(tasksRow(["test:unit", "build"])).toMatchObject({ status: "ok", detail: "2 of 2 use flat ids" });
	});

	it("names the replacement of a deprecated alias, and every successor of one that splits", () => {
		const row = tasksRow(["delivery.build", "build", "sourceQuality.formatting", "constructor"]);
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual([
			"delivery.build: a deprecated alias; use build",
			"sourceQuality.formatting: a deprecated alias; use lint:editorconfig, lint:markdown, format",
		]);
	});
});

describe("callerProblems", () => {
	it("accepts a caller named for its id, with a colon or a hyphen", () => {
		const callers = [
			caller("ci.test-unit.yml", flat("test:unit")),
			caller("lint-code.yml", flat("lint:code")),
			caller("ci.build.yml", flat("build")),
			caller("ci.ci.yml", flat("ci")),
			caller("ci.yml", flat("ci")),
		];
		expect(callerProblems(callers)).toEqual([]);
	});

	it("accepts a job named for the id with a suffix, and the combined deploy's two jobs", () => {
		const release = caller("ci.release.yml", {
			name: "release",
			jobs: [
				{ id: "release-groups", name: "release ${{ matrix.group }}", uses: "./r.yml" },
				{ id: "release", name: "release", uses: "./r.yml" },
			],
		});
		const docs = caller("ci.deploy-docs.yml", {
			name: "deploy-docs",
			jobs: [
				{ id: "deploy-docs", name: "deploy-docs", uses: "./d.yml" },
				{ id: "deploy-docs-preview", name: "deploy-docs", uses: "./p.yml" },
			],
		});
		const components = caller("ci.deploy-components.yml", flat("deploy-components"));
		expect(callerProblems([release, docs, components])).toEqual([]);
	});

	it("reports a wrong workflow name and a wrong job name, and a missing one", () => {
		const callers = [
			caller("ci.test-unit.yml", {
				name: "Verification",
				jobs: [{ id: "test-unit", name: "Unit tests", uses: "./x.yml" }],
			}),
			caller("ci.build.yml", { jobs: [{ id: "build", uses: "./x.yml" }] }),
			caller("ci.lint-code.yml", {
				name: "lint:code",
				jobs: [{ id: "lint-code", name: "lint:codex", uses: "./x.yml" }],
			}),
		];
		expect(callerProblems(callers)).toEqual([
			'ci.test-unit.yml: workflow name "Verification", expected test:unit',
			'ci.test-unit.yml: job test-unit is named "Unit tests", expected test:unit',
			'ci.build.yml: workflow name "", expected build',
			'ci.build.yml: job build is named "", expected build',
			'ci.lint-code.yml: job lint-code is named "lint:codex", expected lint:code',
		]);
	});

	it("reports an old caller file with the flat name that replaces it, once", () => {
		const callers = [
			caller("ci.verification.unitTests.yml", {
				name: "Verification",
				jobs: [{ id: "u", name: "Unit", uses: "./x.yml" }],
			}),
			caller("sourceQuality.formatting.yml", {
				name: "Source Quality",
				jobs: [{ id: "f", name: "F", uses: "./x.yml" }],
			}),
		];
		expect(callerProblems(callers)).toEqual([
			"ci.verification.unitTests.yml: an old caller name; the flat name is ci.test-unit.yml",
			"sourceQuality.formatting.yml: an old caller name; the flat name is lint-editorconfig.yml, lint-markdown.yml",
		]);
	});

	it("does not call a caller an old name when the old hyphen id has the same flat file (measure-docs, #2070)", () => {
		const callers = [
			caller("ci.measure-docs.yml", flat("measure:docs")),
			caller("ci.measure-bundle.yml", {
				name: "measure-bundle",
				jobs: [{ id: "measure-bundle", name: "measure-bundle", uses: "./x.yml" }],
			}),
		];
		expect(callerProblems(callers)).toEqual([
			'ci.measure-bundle.yml: workflow name "measure-bundle", expected measure:bundle',
			'ci.measure-bundle.yml: job measure-bundle is named "measure-bundle", expected measure:bundle',
		]);
	});

	it("leaves a caller that is not for a known task alone", () => {
		expect(callerProblems([caller("ci.custom.yml", flat("custom"))])).toEqual([]);
	});
});

describe("callersRow", () => {
	it("is a skip without callers", () => {
		expect(callersRow([])).toMatchObject({ status: "skip", detail: "no generated callers in .github/workflows" });
	});

	it("passes and fails by the problems", () => {
		expect(callersRow([caller("ci.build.yml", flat("build"))])).toMatchObject({
			status: "ok",
			detail: "1 of 1 named for their id",
		});
		const row = callersRow([caller("ci.delivery.build.yml", flat("build"))]);
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual(["ci.delivery.build.yml: an old caller name; the flat name is ci.build.yml"]);
	});
});

describe("aggregateRow", () => {
	const aggregate = (expected: string[], file = "ci.ci.yml") =>
		caller(file, { name: "ci", jobs: [{ id: "ci", name: "ci", uses: "./ci.yml" }], expected });

	it("is a skip without an aggregate caller, or one with no expected list", () => {
		expect(aggregateRow([], ["build"])).toMatchObject({ status: "skip", detail: "no ci aggregate caller" });
		expect(aggregateRow([caller("ci.ci.yml", flat("ci"))], ["build"]).status).toBe("skip");
		expect(aggregateRow([aggregate(["build"], "ci.build.yml")], ["build"]).status).toBe("skip");
	});

	it("passes when the lists match, in any order, from ci.ci.yml or ci.yml", () => {
		expect(aggregateRow([aggregate(["lint:code", "build"])], ["build", "lint:code"])).toMatchObject({
			status: "ok",
			detail: "2 of 2 ids match",
		});
		expect(aggregateRow([aggregate(["build"], "ci.yml")], ["build"]).status).toBe("ok");
	});

	it("names a missing id and a stale one", () => {
		const row = aggregateRow([aggregate(["build", "lint:old"])], ["build", "typecheck"]);
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual(["missing id typecheck", "stale id lint:old (no configured task)"]);
	});
});

describe("homeRow", () => {
	const at = (file: string, uses: string) => caller(file, { name: "x", jobs: [{ id: "x", uses }] });

	it("is a skip without callers", () => {
		expect(homeRow([], true).status).toBe("skip");
	});

	it("says the legacy home is frozen, and whether repo sync still writes its names", () => {
		const callers = [at("a.yml", `${LEGACY_HOME}/a.yml@main`)];
		expect(homeRow(callers, true)).toMatchObject({
			status: "ok",
			detail: "theholocron/.github (frozen copies, legacy names); repo sync still writes these names",
		});
		expect(homeRow(callers, false).detail).toContain("repo sync now writes flat names");
	});

	it("passes for ci-v1, for this repo's own reusables and for somewhere else", () => {
		expect(homeRow([at("a.yml", `${FLAT_HOME}/a.yml@ci-v1`)], true).detail).toBe(
			"theholocron/holocron at ci-v1 (flat names)"
		);
		expect(homeRow([at("a.yml", "./.github/workflows/a.yml")], true).detail).toBe(
			"this repo's own reusables (flat names)"
		);
		expect(homeRow([at("a.yml", "x/y/.github/workflows/a.yml@v1")], true).detail).toBe("somewhere else");
	});

	it("fails when the callers are split between homes", () => {
		const row = homeRow(
			[
				at("a.yml", `${LEGACY_HOME}/a.yml@main`),
				at("b.yml", `${FLAT_HOME}/b.yml@ci-v1`),
				at("c.yml", `${LEGACY_HOME}/c.yml@main`),
			],
			true
		);
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual([
			"theholocron/.github (frozen copies, legacy names): a.yml, c.yml",
			"theholocron/holocron at ci-v1 (flat names): b.yml",
		]);
	});
});

describe("runDoctorCi", () => {
	const run = async (
		tasks: unknown[] | undefined,
		files: { file: string; text: string }[],
		extra: Partial<RunDoctorCiInput> = {},
		extraRequiredChecks?: string[]
	) => {
		const lines: string[] = [];
		const io: CiIo = { workflows: () => files };
		const report = await runDoctorCi({
			loaded: {
				resolved: { ...(tasks ? { tasks } : {}), ...(extraRequiredChecks ? { extraRequiredChecks } : {}) },
			} as never,
			context: { repoRoot: "/repo" },
			io,
			print: (line) => lines.push(line),
			logger: { info: () => {} } as never,
			...extra,
		});
		return { report, lines };
	};

	const moved = [
		{ file: "ci.build.yml", text: text(flat("build")) },
		{
			file: "ci.ci.yml",
			text: text({
				name: "ci",
				jobs: [{ id: "ci", name: "ci", uses: "./.github/workflows/ci.yml" }],
				expected: ["build", "Generated files"],
			}),
		},
		{ file: "build.yml", text: "name: Delivery\non:\n  workflow_call:\n" },
	];

	it("passes on a repo that has moved: flat tasks, flat callers, a matching aggregate, one home", async () => {
		const { report, lines } = await run([{ name: "build", required: true }], moved, {}, ["Generated files"]);
		expect(report.status).toBe("ok");
		expect(report.summary).toEqual({ ok: 4, fail: 0, skip: 0 });
		expect(lines.at(-1)).toContain("4 ok, 0 fail, 0 skipped");
	});

	it("fails when the aggregate lists a stale id", async () => {
		const { report } = await run([{ name: "build", required: true }], moved);
		expect(report.status).toBe("fail");
		expect(report.rows.find((r) => r.id === "aggregate")?.problems).toEqual([
			"stale id Generated files (no configured task)",
		]);
	});

	it("fails on a repo with old caller names and deprecated aliases", async () => {
		const old = [
			{
				file: "delivery.build.yml",
				text: text({
					name: "Delivery",
					jobs: [{ id: "build", name: "Build", uses: `${LEGACY_HOME}/delivery.build.yml@main` }],
				}),
			},
		];
		const { report, lines } = await run(["delivery.build"], old, { legacyGate: true });
		expect(report.status).toBe("fail");
		expect(report.rows.map((r) => `${r.id}:${r.status}`)).toEqual([
			"tasks:fail",
			"callers:fail",
			"aggregate:skip",
			"home:ok",
		]);
		expect(lines.join("\n")).toContain("delivery.build: a deprecated alias; use build");
		expect(lines.join("\n")).toContain("delivery.build.yml: an old caller name; the flat name is build.yml");
	});

	it("skips the rows that need callers, and still passes, when there is nothing to read", async () => {
		const { report } = await run(undefined, [], { legacyGate: false });
		expect(report.rows.map((r) => r.status)).toEqual(["ok", "skip", "skip", "skip"]);
		expect(report.rows[0]!.detail).toBe("0 of 0 use flat ids");
		expect(report.status).toBe("ok");
	});

	it("prints to the console and reads the real folder when given neither a printer nor an io", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorCi({
			loaded: { resolved: {} } as never,
			context: { repoRoot: "/nonexistent-doctor-ci" },
		});
		expect(report.status).toBe("ok");
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("reads the gate from astromech when it is not given", async () => {
		const legacy = [
			{ file: "x.yml", text: text({ name: "X", jobs: [{ id: "x", uses: `${LEGACY_HOME}/x.yml@main` }] }) },
		];
		const { report } = await run([], legacy);
		expect(report.rows.find((r) => r.id === "home")?.detail).toContain("theholocron/.github");
	});
});
