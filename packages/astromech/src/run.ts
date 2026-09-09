/**
 * `holocron run <task> [-- <passthrough>]` — run a registry task locally.
 *
 * Resolution:
 *
 *   0. task === "lint"                        → the linter aggregate (see below)
 *   1. turbo.json defines the task            → `turbo run <task>`
 *   2. package.json has a `<task>` script     → `<pm> run <task>`
 *      (unless it's the `holocron run …` thin caller — that recurses)
 *   3. TASKS[task].local resolves             → `<tool> <args> <org-flags> <passthrough>`
 *   4. known task, nothing to run             → "no <task> task" (exit 0, or 1 with --required)
 *   5. unknown task                           → "unknown task" (exit 1)
 *
 * `lint` runs the resolved linter set (`config.tasks` `linters`, else
 * auto-detected): the eslint slot goes through the standard turbo / script /
 * `eslint .` resolution (so turbo caching is kept); every other linter runs
 * its `localBin` when found on PATH. Missing tools are flagged; the exit code
 * is the worst of the lot.
 */

import { join } from "node:path";

import { resolveLinters } from "./linters.js";
import { KNOWN_TASKS, type LocalRunner, TASKS } from "./registry.js";

/** Minimal structural logger — `@theholocron/logger`'s `Logger` satisfies it. */
export interface RunLogger {
	debug(obj: Record<string, unknown>, msg?: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
}

export type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { exitCode: number };

/**
 * Everything `runTask` needs from the outside world. `createAstromech`
 * fills these with real implementations (or the caller's injected ones);
 * `runTask` never reaches for a global itself, so it has no default
 * branches to leave untested.
 */
export interface RunDeps {
	print: (line: string) => void;
	logger: RunLogger;
	exec: ExecFn;
	readFile: (path: string) => string;
	fileExists: (path: string) => boolean;
	listDir: (path: string) => string[];
	/** `node_modules/.bin/<bin>` or a PATH entry; `null` when not runnable. */
	lookPath: (cwd: string, bin: string) => string | null;
}

export interface RunTaskInput extends RunDeps {
	/** Registry task name, e.g. `"test"`. */
	task: string;
	/** Directory to run in. */
	cwd: string;
	/** Args after `--` on the command line, forwarded to the tool / turbo / script. */
	passthrough?: string[];
	/** Print the resolved command without running it. */
	dryRun?: boolean;
	/** Turn "no such task for this repo" (normally exit 0) into a failure. */
	required?: boolean;
	/** The `lint` task's explicit linter list from `config.tasks`, if any. */
	linters?: string[];
}

export interface RunTaskReport {
	status: "ok" | "fail" | "skip" | "dry-run" | "unknown";
	/** Resolved command, for the caller / tests. */
	command?: string;
	message?: string;
}

/** The per-command runner — `runTask` and `runLintAggregate` share it. */
function makeRunOne(input: RunTaskInput): (cmd: string, args: string[]) => RunTaskReport {
	const { print, logger, exec, task, cwd } = input;
	const dryRun = input.dryRun ?? false;
	return (cmd, args) => {
		const command = [cmd, ...args].join(" ");
		if (dryRun) {
			print(`would run: ${command}`);
			logger.debug({ task, command, status: "dry-run" }, `run: ${task}`);
			return { status: "dry-run", command };
		}
		print(`→ ${command}`);
		const { exitCode } = exec(cmd, args, { cwd });
		const status = exitCode === 0 ? "ok" : "fail";
		logger[status === "fail" ? "warn" : "debug"]({ task, command, exitCode, status }, `run: ${task}`);
		return { status, command, ...(status === "fail" ? { message: `\`${command}\` exited ${exitCode}` } : {}) };
	};
}

export function runTask(input: RunTaskInput): RunTaskReport {
	const { print, logger, readFile, fileExists, listDir, task, cwd } = input;
	const passthrough = input.passthrough ?? [];
	const run = makeRunOne(input);

	// ── 0. lint aggregate ─────────────────────────────────────────────
	if (task === "lint") return runLintAggregate(input);

	// ── 1. turbo delegation (monorepo root) ────────────────────────────
	if (turboDefinesTask(cwd, task, readFile, fileExists)) {
		const args = ["run", task, ...(passthrough.length ? ["--", ...passthrough] : [])];
		return run(resolveBin(cwd, "turbo", fileExists), args);
	}

	const def = TASKS[task];

	// ── 2. an explicit package.json script wins ────────────────────────
	// (unless it's the `holocron run <task>` thin caller — that would recurse)
	const script = packageJsonScript(cwd, task, readFile, fileExists);
	if (script && !/^holocron run\b/.test(script.trim())) {
		const pm = packageManager(cwd, readFile, fileExists);
		const args = ["run", task, ...(passthrough.length ? ["--", ...passthrough] : [])];
		return run(pm, args);
	}

	// ── 3. registry local runner ───────────────────────────────────────
	if (def?.local) {
		if (def.local.command) {
			// A holocron subcommand (sync, sync-wiki) — invoke this CLI.
			return run(process.execPath, [process.argv[1]!, def.local.command, ...passthrough]);
		}
		const runner = resolveRunner(def.local, cwd, listDir);
		if (runner) {
			const flags = def.flags?.[runner.tool] ?? [];
			const bin = resolveBin(cwd, runner.tool, fileExists);
			return run(bin, [...runner.args, ...flags, ...passthrough]);
		}
		// registry knows the task but nothing in this repo matches — fall through
	}

	// ── 4 / 5. nothing to run ──────────────────────────────────────────
	if (KNOWN_TASKS.has(task) || def?.local === null) {
		const msg = `no ${task} task for this repo`;
		print(input.required ? `✗ ${msg} (required)` : `· ${msg}`);
		logger[input.required ? "warn" : "debug"]({ task, status: input.required ? "fail" : "skip" }, `run: ${task}`);
		return { status: input.required ? "fail" : "skip", message: msg };
	}
	print(`✗ unknown task "${task}"`);
	logger.warn({ task, status: "unknown" }, `run: ${task}`);
	return { status: "unknown", message: `unknown task "${task}"` };
}

/**
 * `holocron run lint` — the resolved linter set, run natively. The eslint
 * slot reuses turbo / the `lint` script / `eslint .`; the rest run their
 * `localBin` when it resolves on PATH. Worst exit code wins.
 */
function runLintAggregate(input: RunTaskInput): RunTaskReport {
	const { print, logger, readFile, fileExists, listDir, lookPath, cwd } = input;
	const passthrough = input.passthrough ?? [];
	const dryRun = input.dryRun ?? false;
	const runOne = makeRunOne(input);
	const pass = passthrough.length ? ["--", ...passthrough] : [];

	let rootFiles: string[];
	try {
		rootFiles = listDir(cwd);
	} catch {
		rootFiles = [];
	}
	const resolved = resolveLinters({ explicit: input.linters, rootFiles });
	const reports: RunTaskReport[] = [];

	/** Run one linter's `localBin` natively, or flag it. */
	const runLinter = (name: string, bin: string | undefined, args: string[], hint?: string): void => {
		if (!bin) {
			print(`· ${name} (CI only)`);
			return;
		}
		const found = lookPath(cwd, bin);
		if (!found) {
			print(`! ${name} — ${bin} not on PATH${hint ? `. ${hint}` : ""} (enforced in CI)`);
			return;
		}
		reports.push(runOne(found, [...args, ...passthrough]));
	};

	// eslint slot — through the standard resolution so turbo caching is kept
	if (resolved.some((r) => r.name === "eslint")) {
		const script = packageJsonScript(cwd, "lint", readFile, fileExists);
		if (turboDefinesTask(cwd, "lint", readFile, fileExists)) {
			reports.push(runOne(resolveBin(cwd, "turbo", fileExists), ["run", "lint", ...pass]));
		} else if (script && !/^holocron run\b/.test(script.trim())) {
			reports.push(runOne(packageManager(cwd, readFile, fileExists), ["run", "lint", ...pass]));
		} else {
			runLinter("eslint", "eslint", ["."]);
		}
	}

	// every other resolved linter, natively
	for (const { name, def } of resolved) {
		if (name === "eslint") continue;
		runLinter(name, def.localBin, def.localArgs ?? [], def.installHint);
	}

	if (reports.length === 0) {
		const msg = "no lint tooling available locally — every resolved linter is CI-only here";
		print(input.required ? `✗ ${msg} (required)` : `· ${msg}`);
		logger[input.required ? "warn" : "debug"]({ task: "lint", status: input.required ? "fail" : "skip" }, "run: lint");
		return { status: input.required ? "fail" : "skip", message: msg };
	}

	const command = reports
		.map((r) => r.command)
		.filter((c): c is string => Boolean(c))
		.join(" && ");
	if (dryRun) return { status: "dry-run", command };
	return reports.some((r) => r.status === "fail")
		? { status: "fail", command, message: "one or more linters failed" }
		: { status: "ok", command };
}

// ── helpers ──────────────────────────────────────────────────────────────────

const mkRunner = (tool: string, args: string[] = []): { tool: string; args: string[] } => ({ tool, args });

/**
 * Resolve `{ tool, args }` for a runner, applying `detect[]` against repo
 * files. Only called for `tool` / `detect` runners — the caller handles
 * `command` runners itself, so `local.detect` is present whenever
 * `local.tool` is not.
 */
function resolveRunner(
	local: LocalRunner,
	cwd: string,
	listDir: (p: string) => string[]
): { tool: string; args: string[] } | undefined {
	if (local.tool) return mkRunner(local.tool, local.args);

	let files: string[];
	try {
		files = listDir(cwd);
	} catch {
		return undefined;
	}
	for (const candidate of local.detect!) {
		if (files.some((f) => candidate.when.test(f))) return mkRunner(candidate.tool, candidate.args);
	}
	return undefined;
}

function resolveBin(cwd: string, tool: string, fileExists: (p: string) => boolean): string {
	const local = join(cwd, "node_modules", ".bin", tool);
	return fileExists(local) ? local : tool;
}

function packageManager(cwd: string, readFile: (p: string) => string, fileExists: (p: string) => boolean): string {
	try {
		const pkg = JSON.parse(readFile(join(cwd, "package.json"))) as { packageManager?: string };
		if (typeof pkg.packageManager === "string") return pkg.packageManager.split("@")[0]!;
	} catch {
		/* no package.json */
	}
	if (fileExists(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
	if (fileExists(join(cwd, "bun.lockb"))) return "bun";
	if (fileExists(join(cwd, "yarn.lock"))) return "yarn";
	if (fileExists(join(cwd, "package-lock.json"))) return "npm";
	return "pnpm";
}

function turboDefinesTask(
	cwd: string,
	task: string,
	readFile: (p: string) => string,
	fileExists: (p: string) => boolean
): boolean {
	if (!fileExists(join(cwd, "turbo.json"))) return false;
	try {
		const turbo = JSON.parse(readFile(join(cwd, "turbo.json"))) as {
			tasks?: Record<string, unknown>;
			pipeline?: Record<string, unknown>;
		};
		return Boolean(turbo.tasks?.[task] ?? turbo.pipeline?.[task]);
	} catch {
		return false;
	}
}

function packageJsonScript(
	cwd: string,
	task: string,
	readFile: (p: string) => string,
	fileExists: (p: string) => boolean
): string | undefined {
	if (!fileExists(join(cwd, "package.json"))) return undefined;
	try {
		const pkg = JSON.parse(readFile(join(cwd, "package.json"))) as { scripts?: Record<string, string> };
		return pkg.scripts?.[task];
	} catch {
		return undefined;
	}
}
