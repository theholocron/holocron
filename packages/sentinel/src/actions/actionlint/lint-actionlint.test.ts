import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { extractRunScripts, lintActionlint, sanitizeExpressions, shellcheckDialect } from "./lint-actionlint.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function file(filename: string, status: "added" | "modified" | "removed" = "modified") {
	return { filename, status };
}

function contentsBody(text: string) {
	return {
		content: Buffer.from(text, "utf8").toString("base64"),
		encoding: "base64",
		sha: "x",
		name: "x",
		path: "x",
	};
}

/** Joins workflow YAML lines with a trailing newline — keeps space-indented YAML out of this tab-indented file's own source lines (editorconfig). */
function workflow(...lines: string[]): string {
	return `${lines.join("\n")}\n`;
}

/** Lints one workflow file's content through the real actionlint + ShellCheck WASM engines. */
async function lintOne(text: string) {
	const { client } = makeClient([
		{ status: 200, body: [file(".github/workflows/ci.yml")] },
		{ status: 200, body: contentsBody(text) },
	]);
	return lintActionlint({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });
}

const CLEAN = workflow(
	"name: CI",
	"on: push",
	"jobs:",
	"  test:",
	"    runs-on: ubuntu-latest",
	"    steps:",
	"      - uses: actions/checkout@v4",
	'      - run: echo "hello"'
);

describe("lintActionlint — which files it reads", () => {
	it("reads only non-removed .yml/.yaml files directly in .github/workflows/, at the PR's own ref", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: [
					file(".github/workflows/ci.yml"),
					file(".github/workflows/release.yaml", "added"),
					file(".github/workflows/old.yml", "removed"),
					file(".github/workflows/nested/x.yml"),
					file(".github/actions/setup/action.yml"),
					file("src/index.ts"),
				],
			},
			{ status: 200, body: contentsBody(CLEAN) },
			{ status: 200, body: contentsBody(CLEAN) },
		]);

		const result = await lintActionlint({ client, repo: "acme/demo", pullNumber: 42, ref: "pr-head-sha" });

		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[1]?.url).toContain("/repos/acme/demo/contents/.github/workflows/ci.yml");
		expect(calls[1]?.url).toContain("ref=pr-head-sha");
		expect(calls[2]?.url).toContain("/repos/acme/demo/contents/.github/workflows/release.yaml");
		expect(calls).toHaveLength(3);
		expect(result).toEqual({ valid: true, fileCount: 2, messages: [] });
	});

	it("reports valid with zero files when the PR touches no workflow", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("README.md")] }]);

		const result = await lintActionlint({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(calls).toHaveLength(1);
		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
	});
});

describe("lintActionlint — actionlint findings", () => {
	it("reports a real actionlint finding as error-severity, at actionlint's own position and kind", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  b:",
				"    needs: c",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - run: echo hi"
			)
		);

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([
			{
				file: ".github/workflows/ci.yml",
				line: 3,
				column: 3,
				ruleId: "job-needs",
				reason: 'job "b" needs job "c" which does not exist in this workflow',
				severity: "error",
			},
		]);
	});

	it("flags untrusted input interpolated into a run: script", async () => {
		const result = await lintOne(
			workflow(
				"on: pull_request",
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				'      - run: echo "${{ github.event.pull_request.title }}"'
			)
		);

		expect(result.messages[0]?.ruleId).toBe("expression");
		expect(result.messages[0]?.reason).toMatch(/potentially untrusted/);
		expect(result.messages[0]?.line).toBe(6);
	});

	it("knows current GitHub syntax actionlint v1.6.8 rejected (secrets: inherit, ubuntu-24.04-arm)", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  call:",
				"    uses: acme/.github/.github/workflows/ci.yml@main",
				"    secrets: inherit",
				"  arm:",
				"    runs-on: ubuntu-24.04-arm",
				"    steps:",
				"      - run: echo hi"
			)
		);

		expect(result.messages).toEqual([]);
	});
});

describe("lintActionlint — shellcheck over run: scripts", () => {
	it("anchors a finding in a | block scalar at its real file line and column, splitting by ShellCheck's own level", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - name: loop",
				"        run: |",
				"          for f in $(ls *.txt); do",
				'            echo "$f"',
				"          done"
			)
		);

		expect(result.messages).toEqual([
			{
				file: ".github/workflows/ci.yml",
				line: 8,
				column: 20,
				ruleId: "SC2045",
				reason: "Iterating over ls output is fragile. Use globs.",
				severity: "error",
			},
			{
				file: ".github/workflows/ci.yml",
				line: 8,
				column: 25,
				ruleId: "SC2035",
				reason: "Use ./*glob* or -- *glob* so names with dashes won't become options.",
				severity: "warning",
			},
		]);
	});

	it("falls back to the run: value's position for a single-line script, keeping the script position in the message", async () => {
		const result = await lintOne(
			workflow("on: push", "jobs:", "  a:", "    runs-on: ubuntu-latest", "    steps:", "      - run: echo $HOME")
		);

		expect(result.messages).toEqual([
			{
				file: ".github/workflows/ci.yml",
				line: 6,
				column: 14,
				ruleId: "SC2086",
				reason: "Double quote to prevent globbing and word splitting. (script line 1, col 6)",
				severity: "warning",
			},
		]);
	});

	it("doesn't flag ${{ }} placeholders or env-assigned variables (actionlint's own exclusions)", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    strategy:",
				"      matrix:",
				"        x: [a, b]",
				"    env:",
				"      FOO: bar",
				"    steps:",
				"      - run: |",
				'          if [ "${{ matrix.x }}" = "a" ]; then echo "$FOO"; fi',
				'          for v in ${{ matrix.x }}; do echo "$v"; done'
			)
		);

		expect(result.messages).toEqual([]);
	});

	it("runs scripts under GitHub's own set -eo pipefail, so an unchecked cd isn't flagged", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - run: |",
				"          cd dist",
				"          ls"
			)
		);

		expect(result.messages).toEqual([]);
	});

	it("lints shell: sh scripts as POSIX sh, under GitHub's own set -e", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - shell: sh",
				"        run: |",
				'          if [[ -n "$HOME" ]]; then echo hi; fi'
			)
		);

		expect(result.messages.map((m) => [m.line, m.ruleId, m.severity])).toEqual([[8, "SC3010", "error"]]);
	});

	it("skips scripts for shells ShellCheck can't lint (python, Windows' default pwsh)", async () => {
		const result = await lintOne(
			workflow(
				"on: push",
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - shell: python",
				"        run: print($HOME)",
				"  w:",
				"    runs-on: windows-latest",
				"    steps:",
				"      - run: echo $HOME"
			)
		);

		expect(result.messages).toEqual([]);
	});
});

describe("extractRunScripts — shell resolution (rule_shellcheck.go's own order)", () => {
	const shells = (text: string) => extractRunScripts(text).map((s) => s.shell);

	it("defaults to bash", () => {
		expect(shells("jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: x\n")).toEqual(["bash"]);
	});

	it("prefers step shell over job defaults over workflow defaults over the runner", () => {
		const text = workflow(
			"defaults:",
			"  run:",
			"    shell: sh",
			"jobs:",
			"  a:",
			"    runs-on: windows-latest",
			"    defaults:",
			"      run:",
			"        shell: bash -e {0}",
			"    steps:",
			"      - run: x",
			"      - shell: pwsh",
			"        run: y",
			"  b:",
			"    runs-on: windows-latest",
			"    steps:",
			"      - run: z",
			"  c:",
			"    runs-on: [self-hosted, windows]",
			"    steps:",
			"      - run: w"
		);
		expect(shells(text)).toEqual(["bash -e {0}", "pwsh", "sh", "sh"]);
	});

	it("uses pwsh on a Windows runner in any runs-on form when nothing else sets a shell", () => {
		const text = workflow(
			"jobs:",
			"  a:",
			"    runs-on: [self-hosted, windows]",
			"    steps:",
			"      - run: x",
			"  b:",
			"    runs-on:",
			"      group: big",
			"      labels: windows-2022",
			"    steps:",
			"      - run: y",
			"  c:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - run: z"
		);
		expect(shells(text)).toEqual(["pwsh", "pwsh", "bash"]);
	});

	it("records a | block scalar's content start and indentation, and nothing for other styles", () => {
		const [block, folded, plain] = extractRunScripts(
			workflow(
				"jobs:",
				"  a:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - run: |",
				"          echo one",
				"      - run: >",
				"          echo two",
				"      - run: echo three"
			)
		);
		expect(block).toMatchObject({ line: 5, column: 14, blockStart: { line: 5, indent: 10 } });
		expect(folded?.blockStart).toBeUndefined();
		expect(plain).toMatchObject({ script: "echo three", line: 9, column: 14 });
		expect(plain?.blockStart).toBeUndefined();
	});

	it("returns nothing for a document YAML can't parse -- actionlint reports that itself", () => {
		expect(extractRunScripts("jobs: [unclosed\n")).toEqual([]);
	});

	it("ignores uses: steps and non-string run: values", () => {
		const text = workflow(
			"jobs:",
			"  a:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: actions/checkout@v4",
			"      - run: 42"
		);
		expect(extractRunScripts(text)).toEqual([]);
	});

	it("skips malformed shapes actionlint itself reports -- jobs not a map, a job or step that isn't a map", () => {
		expect(extractRunScripts(workflow("jobs: []"))).toEqual([]);
		expect(extractRunScripts(workflow("on: push"))).toEqual([]);
		const text = workflow(
			"jobs:",
			"  scalar-job: 1",
			"  a:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - just a string",
			"      - run: echo ok"
		);
		expect(extractRunScripts(text).map((s) => s.script)).toEqual(["echo ok"]);
	});

	it("ignores non-string and nested runs-on labels when looking for a Windows runner", () => {
		const text = workflow(
			"jobs:",
			"  a:",
			"    runs-on: [self-hosted, { weird: 1 }, 42]",
			"    steps:",
			"      - run: x",
			"  b:",
			"    runs-on: 42",
			"    steps:",
			"      - run: y"
		);
		expect(extractRunScripts(text).map((s) => s.shell)).toEqual(["bash", "bash"]);
	});

	it("records indent 0 for an empty | block scalar with no content line to measure", () => {
		const [run] = extractRunScripts(
			workflow("jobs:", "  a:", "    runs-on: ubuntu-latest", "    steps:", "      - run: |")
		);
		expect(run).toMatchObject({ script: "", blockStart: { line: 5, indent: 0 } });
	});
});

describe("sanitizeExpressions", () => {
	it("replaces each ${{ }} with same-length underscores so columns don't move", () => {
		expect(sanitizeExpressions('echo "${{ a }}" ${{ b.c }}')).toBe('echo "________" __________');
	});
});

describe("shellcheckDialect", () => {
	it("narrows to the two dialects ShellCheck lints", () => {
		expect(shellcheckDialect("bash")).toBe("bash");
		expect(shellcheckDialect("bash -e {0}")).toBe("bash");
		expect(shellcheckDialect("sh")).toBe("sh");
		expect(shellcheckDialect("sh -e {0}")).toBe("sh");
		expect(shellcheckDialect("pwsh")).toBeUndefined();
		expect(shellcheckDialect("python")).toBeUndefined();
		expect(shellcheckDialect("bashful")).toBeUndefined();
	});
});
