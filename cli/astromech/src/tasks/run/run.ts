/**
 * `holocron run <task> [-- <passthrough>]` — run a registry task locally.
 *
 * `task` is a flat id (`test:unit`, `build`); `Astromech.run()` turns
 * the words of the command line (`test unit`, an old dotted name) into one.
 *
 * Resolution:
 *
 *   1. turbo.json defines the task            → `turbo run <task>`
 *   2. package.json has a `<task>` script     → `<pm> run <task>`
 *      (unless it's the `holocron run …` thin caller — that recurses — or the root script generated from the
 *      registry's own command, which the registry then runs itself)
 *   3. TASKS[task].local resolves             → `<tool> <args> <passthrough>`
 *   3b. TASKS[task].linterGroup               → run each resolved linter natively (see below)
 *   4. TASKS[task].local === null             → "enforced in CI" (skip, even with --required)
 *   4b. known task, nothing resolved          → "no <task> task" (exit 0, or 1 with --required)
 *   5. unknown task                           → "unknown task" (exit 1)
 *
 * A `linterGroup` task (`sourceQuality.staticAnalysis`, etc.) runs its fixed
 * set of `linters.ts` entries, each still gated by that linter's own
 * `detect`/`always` rule — every entry runs its `localBin` natively when
 * found on PATH. Missing tools are flagged; the exit code is the worst of
 * the lot. Unlike the old single `lint` task, this check runs *after*
 * turbo/`package.json` resolution (step 3b, not step 0) — a `linterGroup`
 * task is a normal turbo-delegatable task like any other.
 */

import { detectPackageManager, readPackageJsonSync } from "@theholocron/pkg-utils";

import { TASKS } from "../../registry/index.js";
import { ownLegacyName, scriptName } from "../../vocabulary/index.js";
import { resolveLinters } from "./linters/index.js";
import { resolveAffected } from "./resolve-affected/index.js";
import { resolveBin } from "./resolve-bin/index.js";
import { resolveRunner } from "./resolve-runner/index.js";
import { resolveToolConfig } from "./resolve-tool-config/index.js";
import type { RunTaskInput, RunTaskReport } from "./run.type.js";
import { toolCommand } from "./tool-command/index.js";
import { turboDefinesTask } from "./turbo-defines-task/index.js";

/** The per-command runner — `runTask` and `runLintAggregate` share it. */
function makeRunOne(input: RunTaskInput): (cmd: string, args: string[], env?: Record<string, string>) => RunTaskReport {
	const { print, logger, exec, task, cwd } = input;
	const dryRun = input.dryRun ?? false;
	return (cmd, args, env) => {
		const command = [cmd, ...args].join(" ");
		if (dryRun) {
			print(`would run: ${command}`);
			logger.debug({ task, command, status: "dry-run" }, `run: ${task}`);
			return { status: "dry-run", command };
		}
		print(`→ ${command}`);
		const { exitCode } = exec(cmd, args, env ? { cwd, env } : { cwd });
		const status = exitCode === 0 ? "ok" : "fail";
		logger[status === "fail" ? "warn" : "debug"]({ task, command, exitCode, status }, `run: ${task}`);
		return { status, command, ...(status === "fail" ? { message: `\`${command}\` exited ${exitCode}` } : {}) };
	};
}

/**
 * Resolves one registry task (an explicit turbo task, a `package.json` script, then the registry's built-in runner)
 * and runs it, or prints the command on a dry run.
 */
export function runTask(input: RunTaskInput): RunTaskReport {
	const { print, logger, readFile, fileExists, listDir, task, cwd } = input;
	const def = TASKS[task];

	let passthrough = input.passthrough ?? [];

	const run = makeRunOne(input);

	// `--check` on a task that writes by default (`format`) is its read-only form: the registry's `checkArgs` replace the
	// tool's args, and no turbo task or package script (whose command may be the writing one) stands in for it.
	const checkForm = def?.checkArgs !== undefined && passthrough.includes("--check");
	if (checkForm) passthrough = passthrough.filter((arg) => arg !== "--check");

	// A task is still called by its old dotted name in `turbo.json` and `package.json` until the later phases rename
	// those keys, so the old name is looked up first, then the id in its script spelling.
	const keys = [...new Set([ownLegacyName(task), scriptName(task)])].filter(
		(key): key is string => key !== undefined
	);
	const turboKey = checkForm ? undefined : keys.find((key) => turboDefinesTask(cwd, key, readFile, fileExists));

	// ── 1. turbo delegation (monorepo root) ────────────────────────────
	if (turboKey !== undefined) {
		const filterArg = input.filter ? [`--filter=${input.filter}`] : [];
		const forwarded = passthrough;
		const plan = resolveAffected({
			affected: input.affected,
			base: input.base,
			env: input.env ?? {},
			exec: input.exec,
			cwd,
		});
		if (plan.notice) print(`· ${plan.notice}`);
		const affectedArg = plan.affected ? ["--affected"] : [];
		const args = ["run", turboKey, ...filterArg, ...affectedArg, ...(forwarded.length ? ["--", ...forwarded] : [])];
		return run(resolveBin(cwd, "turbo", fileExists), args, plan.env);
	}

	if (input.affected) print("· --affected ignored: this repo has no turbo task for it");

	// ── 2. an explicit package.json script wins ────────────────────────
	// (unless it's the `holocron run <task>` thin caller — that would recurse)
	const scripts = checkForm ? undefined : readPackageJsonSync(cwd, { readFile })?.scripts;
	// The root script generated for a repo-scoped leaf holds the registry's own command: run that natively instead, so a
	// tool that is not installed is a note (as it is for a repo that has no such script) and not a failed `pnpm run`.
	const generated = def ? toolCommand(def) : null;
	const scriptKey = keys.find((key) => {
		const script = scripts?.[key]?.trim();
		return script !== undefined && script !== "" && !/^holocron run\b/.test(script) && script !== generated;
	});
	if (scriptKey !== undefined) {
		const pm = detectPackageManager(cwd, { readFile, fileExists });
		const args = ["run", scriptKey, ...(passthrough.length ? ["--", ...passthrough] : [])];
		return run(pm, args);
	}

	// ── 3. registry local runner ───────────────────────────────────────
	if (def?.local) {
		if (def.local.command) {
			// A holocron subcommand (sync, sync-wiki, sync github) — invoke
			// this CLI. Split on whitespace: each word is its own argv
			// entry (a nested yargs command path like "sync github" needs
			// two separate tokens, not one string containing a space).
			return run(process.execPath, [process.argv[1]!, ...def.local.command.split(" "), ...passthrough]);
		}
		const runner = resolveRunner(def.local, cwd, listDir, readFile);
		if (runner) {
			// `--config <resolved shared path>` (config-resolution workstream,
			// #676) — `[]` when the tool isn't a resolvable one, the shared
			// package isn't installed, or its built dist/ is missing; the tool
			// then falls back to its own auto-discovery of a local file,
			// unchanged from today. Read at run time since it depends on
			// what's actually installed in this repo's node_modules.
			const configFlags = resolveToolConfig(runner.tool, cwd, { readFile, fileExists });
			const bin = resolveBin(cwd, runner.tool, fileExists);
			const args = checkForm ? def.checkArgs! : runner.args;
			return run(bin, [...args, ...configFlags, ...passthrough]);
		}
		// registry knows the task but nothing in this repo matches — fall through
	}

	// ── 3b. linter-group aggregate ──────────────────────────────────────
	if (def?.linterGroup) return runLinterGroup(input, def.linterGroup, passthrough);

	// ── 4. no local equivalent by design (`local: null` — codeql, deploy) ─
	// Steps 1–2 already had their chance, so an explicit repo script still
	// wins. Reaching here means the registry offers nothing and the repo
	// added nothing — that is CI-enforced, never a *local* failure.
	if (def?.local === null) {
		const msg = `no local equivalent for ${task} — enforced in CI`;
		print(`· ${msg}`);
		logger.debug({ task, status: "skip" }, `run: ${task}`);
		return { status: "skip", message: msg };
	}

	// ── 4b. known task, nothing in this repo runs it ───────────────
	if (def) {
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
 * `holocron run <task>` for a `linterGroup` task — the task's fixed linter
 * set, each still gated by its own `detect`/`always` rule, run natively.
 * Worst exit code wins. Runs *after* the caller's own turbo/`package.json`
 * resolution (step 3b) — no per-linter turbo passthrough here, unlike the
 * old single `lint` task's eslint-only special case; the whole task is what
 * turbo/a package script would have already caught in steps 1–2.
 */
function runLinterGroup(input: RunTaskInput, names: string[], passthrough: string[]): RunTaskReport {
	const { print, logger, listDir, lookPath, cwd, task, readFile, fileExists } = input;
	const dryRun = input.dryRun ?? false;
	const runOne = makeRunOne(input);

	let rootFiles: string[];
	try {
		rootFiles = listDir(cwd);
	} catch {
		rootFiles = [];
	}
	// A linter with no local config file of its own still counts as
	// "configured" when its shared `@theholocron/*-config` package resolves
	// (holocron#795) — same resolution `resolveToolConfig` does for the
	// actual command below, reused here just to decide inclusion rather than
	// to build args yet.
	const sharedConfigAvailable = new Set(
		names.filter((name) => resolveToolConfig(name, cwd, { readFile, fileExists }).length > 0)
	);
	const resolved = resolveLinters({ explicit: names, rootFiles, sharedConfigAvailable });
	const reports: RunTaskReport[] = [];
	// Distinguishes "every member of this group is structurally CI-only"
	// (commitlint has no localBin, ever — no PR commit range to diff locally,
	// same shape as a `local: null` task) from "a linter has a localBin but
	// it's just not on PATH right now" (an actionable, install-it gap).
	let anyHasLocalBin = false;

	for (const { name, def } of resolved) {
		const bin = def.localBin;
		if (!bin) {
			print(`· ${name} (CI only)`);
			continue;
		}
		anyHasLocalBin = true;
		const found = lookPath(cwd, bin);
		if (!found) {
			print(`! ${name} — ${bin} not on PATH${def.installHint ? `. ${def.installHint}` : ""} (enforced in CI)`);
			continue;
		}
		// Same `--config <resolved shared path>` resolution as the tool/detect
		// runner path (step 3) — `[]` when `name` isn't a resolvable tool, so
		// this is a no-op for e.g. `gitleaks`/`yamllint`/`actionlint`. Placed
		// before `localArgs` — verified working in that order against a real
		// `eslint --config <path> .` invocation; ESLint's own args parser
		// otherwise treats a trailing `--config` after the path argument
		// inconsistently across versions.
		const configFlags = resolveToolConfig(name, cwd, { readFile, fileExists });
		reports.push(runOne(found, [...configFlags, ...(def.localArgs ?? []), ...passthrough]));
	}

	if (reports.length === 0) {
		// D8: a genuinely CI-only task (no group member has a local equivalent
		// at all) is skipped, never failed, even when required — same carve-out
		// `local: null` tasks already get. Only fail-if-required when at least
		// one linter *could* run locally but its tool just isn't installed.
		const required = input.required && anyHasLocalBin;
		const msg = `no tooling available locally for ${task} — every linter in this group is CI-only here`;
		print(required ? `✗ ${msg} (required)` : `· ${msg}`);
		logger[required ? "warn" : "debug"]({ task, status: required ? "fail" : "skip" }, `run: ${task}`);
		return { status: required ? "fail" : "skip", message: msg };
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
