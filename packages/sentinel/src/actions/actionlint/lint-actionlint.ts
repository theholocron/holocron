/**
 * Lints a PR's own changed GitHub Actions workflow files with actionlint,
 * plus shellcheck over every step's `run:` script — the actionlint half of
 * the `sourceQuality.staticAnalysis` task ("Run eslint and actionlint"),
 * same config-free, no-checkout architecture as the eslint check beside it
 * (holocron#849/#904).
 *
 * D1-equivalent: real actionlint (`@tktco/node-actionlint` — rhysd/actionlint
 * v1.7.7's own playground entry point compiled to WASM, the same version
 * `sync-github.yml` pins for its binary) and real ShellCheck
 * (`@vscode-shellcheck/shellcheck-wasm` — ShellCheck 0.11 as a WASI
 * command module, the vscode-shellcheck extension's own runtime, output
 * byte-identical to the native binary of the same version), never a
 * reimplementation of either tool's rules. Not the upstream
 * `sosukesuzuki/node-actionlint`: it bundles actionlint v1.6.8 and reported
 * 101 false positives across this repo's own workflows (`secrets: inherit`,
 * newer runner labels) where the fork reports none.
 *
 * **Why shellcheck is wired in here by hand**: the actionlint binary shells
 * out to a `shellcheck` executable on PATH for every `run:` script; a WASM
 * build can't spawn processes, so that integration silently disappears.
 * {@link extractRunScripts} + {@link lintRunScript} port it from
 * actionlint's own `rule_shellcheck.go` (v1.7.7) — same shell resolution
 * order (step `shell` → job `defaults.run.shell` → workflow
 * `defaults.run.shell` → `pwsh` on a `windows*` runner → `bash`), same
 * `${{ }}` → same-length-underscores sanitizing, same `set -e` /
 * `set -eo pipefail` prelude GitHub itself runs a script with, and the same
 * excluded rules (see {@link SHELLCHECK_EXCLUDED}). One deliberate
 * improvement over the binary: a finding inside a `|` literal block scalar
 * (lines kept 1:1, only indentation stripped) is anchored at its real file
 * line/column, not at the `run:` key — actionlint itself always reports at
 * `run:` because `>`/plain multi-line scalars can't be mapped back. Those
 * still fall back to the `run:` position here too, with the script-relative
 * position kept in the message.
 *
 * Security boundary (D6-amended, same as `lint-static-analysis.ts`): reads
 * each changed file's content on the PR's own head ref via
 * `GitHubClient.git.getContents(repo, path, ref)` — a same-repo PR branch,
 * not a fork's. Workflow content is only ever parsed, never executed.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import type { GitHubClient } from "@theholocron/github-client";
import { createShellCheck, type ShellCheck, type ShellCheckOptions, wasmUrl } from "@vscode-shellcheck/shellcheck-wasm";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, Scalar, type YAMLMap } from "yaml";

import { decodeContents } from "../../utils/decode-contents.js";

const WORKFLOW_DIR = ".github/workflows/";
const WORKFLOW_EXTENSIONS = [".yml", ".yaml"];

/**
 * actionlint's own exclusions (`rule_shellcheck.go`): SC1091 (sourced file
 * not found — scripts run in CI, not here), SC2194/SC2050/SC2157/SC2043
 * (false positives from `${{ }}` → underscore placeholders), SC2154
 * (variables assigned via the step/job/workflow `env:` section look
 * unassigned to the script).
 */
const SHELLCHECK_EXCLUDED = [1091, 2194, 2050, 2154, 2157, 2043];

interface ActionlintResult {
	message: string;
	line: number;
	column: number;
	kind: string;
}

type RunLint = (source: string, path: string) => Promise<ActionlintResult[]>;

/**
 * `createRequire`, not `import`: the fork's ESM build calls `require()`
 * internally and throws `ERR_AMBIGUOUS_MODULE_SYNTAX`; its CommonJS build
 * (the `require` export condition) works. Loaded lazily — instantiating the
 * 9 MB WASM module costs ~120 ms, which only a PR touching a workflow file
 * should pay.
 */
const require = createRequire(import.meta.url);

let runActionlint: RunLint | undefined;
function actionlint(): RunLint {
	runActionlint ??= (require("@tktco/node-actionlint") as { runLint: RunLint }).runLint;
	return runActionlint;
}

/** Node's `WebAssembly` global — this package's `node-lts` tsconfig ships no DOM/WebAssembly lib types to name it with. */
const wasm = (globalThis as unknown as { WebAssembly: { compile(bytes: Uint8Array): ShellCheckOptions["module"] } })
	.WebAssembly;

/** Compiled once per warm function instance and reused — compiling the 10 MB module is the expensive part; instantiating it per lint is cheap. */
let shellcheckModule: ShellCheckOptions["module"] | undefined;

/**
 * The package lints inside a Worker the host provides (WASI needs a
 * blocking thread to wait on). Its worker side is an importable module, not
 * a ready-made script, so the Worker's entry is a two-line inline ESM
 * module pointing at it by absolute file URL — no extra file for tsdown to
 * emit or `stage-deploy.mjs` to copy. Every `lint()` instantiates a fresh
 * WASI instance (no state carried between scripts — the non-command
 * `shellcheck-wasm` build corrupts its runtime after a handful of calls in
 * a row, which is why it isn't used here).
 */
function startShellcheck(): ShellCheck {
	shellcheckModule ??= readFile(wasmUrl).then((bytes) => wasm.compile(bytes));
	const workerEntry = pathToFileURL(require.resolve("@vscode-shellcheck/shellcheck-wasm/worker")).href;
	const source = [
		'import { parentPort } from "node:worker_threads";',
		`import { startWorker } from ${JSON.stringify(workerEntry)};`,
		'startWorker({ postMessage: (m) => parentPort.postMessage(m), onMessage: (l) => parentPort.on("message", l) });',
	].join("\n");
	return createShellCheck({
		module: shellcheckModule,
		createWorker() {
			const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`));
			return {
				postMessage: (message) => worker.postMessage(message),
				onMessage: (listener) => worker.on("message", listener),
				onError: (listener) => worker.on("error", listener),
				onExit: (listener) => worker.on("exit", listener),
				terminate: () => worker.terminate(),
			};
		},
	});
}

/** One ShellCheck JSON1 comment — the subset of fields this check reads. */
interface ShellCheckComment {
	line: number;
	column: number;
	level: "error" | "warning" | "info" | "style";
	code: number;
	message: string;
}

/** Generous per-script ceiling — a real `run:` script lints in ~40 ms; this only guards against a wedged guest. */
const SHELLCHECK_TIMEOUT_MS = 10_000;

export interface LintActionlintInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface ActionlintMessage {
	file: string;
	/** 1-indexed. */
	line: number;
	/** 1-indexed. */
	column: number;
	/** actionlint's own rule kind (`expression`, `syntax-check`, `job-needs`, …) or a ShellCheck code (`SC2086`). */
	ruleId: string;
	reason: string;
	/**
	 * Every actionlint finding is `"error"` (actionlint has no severity axis —
	 * the binary fails on any of them). ShellCheck's own level splits:
	 * `error`/`warning` → `"error"`, `info`/`style` → `"warning"` (advisory).
	 */
	severity: "error" | "warning";
}

export interface LintActionlintResult {
	valid: boolean;
	fileCount: number;
	messages: ActionlintMessage[];
}

/** One step's `run:` script, with everything needed to lint it and map findings back to the file. */
export interface RunScript {
	script: string;
	/** The resolved shell, before narrowing to what ShellCheck supports (e.g. `"bash"`, `"bash -e {0}"`, `"pwsh"`). */
	shell: string;
	/** 1-indexed position of the `run:` value — the fallback anchor for anything {@link blockStart} can't map. */
	line: number;
	column: number;
	/**
	 * Set only for a `|` literal block scalar: script line N lives on file
	 * line `line + N`, script column C at file column `indent + C`.
	 */
	blockStart?: { line: number; indent: number };
}

function stringAt(map: unknown, path: string[]): string | undefined {
	if (!isMap(map)) return undefined;
	const value = map.getIn(path);
	return typeof value === "string" ? value : undefined;
}

/** A scalar node's value, or every scalar item's value in a sequence node. */
function scalarValues(node: unknown): unknown[] {
	if (isScalar(node)) return [node.value];
	if (isSeq(node)) return node.items.flatMap((item: unknown) => (isScalar(item) ? [item.value] : []));
	return [];
}

/** `pwsh` when any `runs-on` label is a Windows runner — GitHub's default shell there, per `rule_shellcheck.go`'s `VisitJobPre`. */
function runnerShell(job: YAMLMap): string | undefined {
	const runsOn: unknown = job.get("runs-on", true);
	// `runs-on: label`, `runs-on: [a, b]`, or `runs-on: { group, labels }`.
	const labels = scalarValues(isMap(runsOn) ? runsOn.get("labels", true) : runsOn);
	const windows = labels.some((l) => {
		const label = typeof l === "string" ? l.toLowerCase() : "";
		return label === "windows" || label.startsWith("windows-");
	});
	return windows ? "pwsh" : undefined;
}

/**
 * Every step's `run:` script in a workflow, with its resolved shell and
 * file position. Returns `[]` for a document YAML itself can't parse —
 * actionlint already reports that as its own `syntax-check` finding.
 */
export function extractRunScripts(text: string): RunScript[] {
	const lineCounter = new LineCounter();
	const doc = parseDocument(text, { lineCounter });
	if (doc.errors.length > 0 || !isMap(doc.contents)) return [];

	const lines = text.split("\n");
	const workflowShell = stringAt(doc.contents, ["defaults", "run", "shell"]);
	const jobs = doc.contents.get("jobs", true);
	if (!isMap(jobs)) return [];

	const scripts: RunScript[] = [];
	for (const pair of jobs.items) {
		const job = pair.value;
		if (!isMap(job)) continue;
		const jobShell = stringAt(job, ["defaults", "run", "shell"]);
		const fallbackShell = jobShell ?? workflowShell ?? runnerShell(job) ?? "bash";
		const steps = job.get("steps", true);
		if (!isSeq(steps)) continue;

		for (const step of steps.items) {
			if (!isMap(step)) continue;
			const run = step.get("run", true);
			if (!isScalar(run) || typeof run.value !== "string" || !run.range) continue;

			const { line, col } = lineCounter.linePos(run.range[0]);
			const script: RunScript = {
				script: run.value,
				shell: stringAt(step, ["shell"]) ?? fallbackShell,
				line,
				column: col,
			};
			if (run.type === Scalar.BLOCK_LITERAL) {
				// `line` is the `|` header's own line; content starts on the next.
				// Indentation is the first non-blank content line's — the same
				// rule YAML itself uses to detect a block scalar's indent.
				const firstContent = lines.slice(line).find((l) => l.trim() !== "");
				const indent = firstContent ? firstContent.length - firstContent.trimStart().length : 0;
				script.blockStart = { line, indent };
			}
			scripts.push(script);
		}
	}
	return scripts;
}

/** `rule_shellcheck.go`'s `sanitizeExpressionsInScript`: `${{ … }}` → one `_` per character, so columns stay put. */
export function sanitizeExpressions(script: string): string {
	return script.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => "_".repeat(match.length));
}

/** `"bash"` / `"sh"` for a shell ShellCheck can lint (`bash -e {0}` counts as bash), `undefined` for anything else (`pwsh`, `python`, `cmd`). */
export function shellcheckDialect(shell: string): "bash" | "sh" | undefined {
	if (shell === "bash" || shell.startsWith("bash ")) return "bash";
	if (shell === "sh" || shell.startsWith("sh ")) return "sh";
	return undefined;
}

async function lintRunScript(shellcheck: ShellCheck, file: string, run: RunScript): Promise<ActionlintMessage[]> {
	const dialect = shellcheckDialect(run.shell);
	if (!dialect) return [];

	// GitHub runs `bash --noprofile --norc -eo pipefail {0}` / `sh -e {0}` —
	// prepend the equivalent so ShellCheck reasons about the same script;
	// every reported line is then one past the script's own.
	const prelude = dialect === "bash" ? "set -eo pipefail" : "set -e";
	const source = `${prelude}\n${sanitizeExpressions(run.script)}\n`;
	const args = [
		"--norc",
		"-f",
		"json1",
		"-s",
		dialect,
		"-e",
		SHELLCHECK_EXCLUDED.map((c) => `SC${c}`).join(","),
		"-",
	];
	const result = await shellcheck.lint(
		{ args, stdin: source },
		{ signal: AbortSignal.timeout(SHELLCHECK_TIMEOUT_MS) }
	);
	// 0 = clean, 1 = findings; anything higher is ShellCheck rejecting its own invocation.
	if (result.exitCode > 1) throw new Error(`shellcheck exited ${result.exitCode}: ${result.stderr.trim()}`);
	const { comments } = JSON.parse(result.stdout) as { comments: ShellCheckComment[] };

	return comments.map((r) => {
		const scriptLine = r.line - 1;
		const ruleId = `SC${r.code}`;
		const severity = r.level === "error" || r.level === "warning" ? "error" : "warning";
		if (run.blockStart) {
			return {
				file,
				line: run.blockStart.line + scriptLine,
				column: run.blockStart.indent + r.column,
				ruleId,
				reason: r.message,
				severity,
			};
		}
		return {
			file,
			line: run.line,
			column: run.column,
			ruleId,
			reason: `${r.message} (script line ${scriptLine}, col ${r.column})`,
			severity,
		};
	});
}

export async function lintActionlint(input: LintActionlintInput): Promise<LintActionlintResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const targets = changedFiles.filter(
		(f) =>
			f.status !== "removed" &&
			f.filename.startsWith(WORKFLOW_DIR) &&
			// Only files directly in .github/workflows/ — GitHub never loads a nested one as a workflow.
			!f.filename.slice(WORKFLOW_DIR.length).includes("/") &&
			WORKFLOW_EXTENSIONS.some((ext) => f.filename.endsWith(ext))
	);

	const messages: ActionlintMessage[] = [];
	// Started lazily (the first `run:` script) and always disposed — its
	// Worker would otherwise outlive the request.
	let shellcheck: ShellCheck | undefined;
	try {
		for (const target of targets) {
			const contents = await client.git.getContents(repo, target.filename, ref);
			const text = decodeContents(contents.content);

			for (const r of await actionlint()(text, target.filename)) {
				// The fork's own `runLintForFiles` drops message-less entries the same way.
				if (!r.message) continue;
				messages.push({
					file: target.filename,
					line: r.line,
					column: r.column,
					ruleId: r.kind,
					reason: r.message,
					severity: "error",
				});
			}

			for (const run of extractRunScripts(text)) {
				if (!shellcheckDialect(run.shell)) continue;
				shellcheck ??= startShellcheck();
				messages.push(...(await lintRunScript(shellcheck, target.filename, run)));
			}
		}
	} finally {
		await shellcheck?.dispose();
	}

	return { valid: messages.length === 0, fileCount: targets.length, messages };
}
