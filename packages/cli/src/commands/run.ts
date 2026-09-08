/**
 * `holocron run <task> [-- <passthrough>]` — run a registry task locally.
 *
 * Resolution (Phase 1, spec `.notes/tech-astromech-task-runner.spec.md`, epic #581):
 *
 *   1. turbo.json defines the task            → `turbo run <task>`
 *   2. TASKS[task].local resolves             → `<tool> <args> <org-flags> <passthrough>`
 *   3. package.json has a `<task>` script     → `<pm> run <task>`
 *   4. known task, nothing to run             → "no <task> task" (exit 0, or 1 with --required)
 *   5. unknown task                           → "unknown task" (exit 1)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Logger } from "@theholocron/logger";

import { getLogger } from "../logger.js";
import { KNOWN_TASKS, type LocalRunner, TASKS } from "../tasks.js";

type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { exitCode: number };

const defaultExec: ExecFn = (cmd, args, opts) => {
	const result = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};

export interface RunTaskInput {
	/** Registry task name, e.g. `"test"`. */
	task: string;
	/** Args after `--` on the command line, forwarded to the tool / turbo / script. */
	passthrough?: string[];
	/** Directory to run in. */
	cwd: string;
	/** Print the resolved command without running it. */
	dryRun?: boolean;
	/** Turn "no such task for this repo" (normally exit 0) into a failure. */
	required?: boolean;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. */
	logger?: Logger;
	/** Injectable subprocess runner. */
	exec?: ExecFn;
	/** Injectable for tests. */
	readFile?: (path: string) => string;
	fileExists?: (path: string) => boolean;
	listDir?: (path: string) => string[];
}

export interface RunTaskReport {
	status: "ok" | "fail" | "skip" | "dry-run" | "unknown";
	/** Resolved command, for the caller / tests. */
	command?: string;
	message?: string;
}

export function runTask(input: RunTaskInput): RunTaskReport {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const exec = input.exec ?? defaultExec;
	const readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const fileExists = input.fileExists ?? ((p: string) => existsSync(p));
	const listDir = input.listDir ?? ((p: string) => readdirSync(p) as string[]);
	const { task, cwd } = input;
	const passthrough = input.passthrough ?? [];
	const dryRun = input.dryRun ?? false;

	const run = (cmd: string, args: string[]): RunTaskReport => {
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
			return run(bin, [...(runner.args ?? []), ...flags, ...passthrough]);
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

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve `{ tool, args }` for a runner, applying `detect[]` against repo files. */
function resolveRunner(
	local: LocalRunner,
	cwd: string,
	listDir: (p: string) => string[]
): { tool: string; args?: string[] } | undefined {
	if (local.tool) return { tool: local.tool, ...(local.args ? { args: local.args } : {}) };
	if (local.detect) {
		let files: string[];
		try {
			files = listDir(cwd);
		} catch {
			return undefined;
		}
		for (const candidate of local.detect) {
			if (files.some((f) => candidate.when.test(f))) {
				return { tool: candidate.tool, ...(candidate.args ? { args: candidate.args } : {}) };
			}
		}
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
