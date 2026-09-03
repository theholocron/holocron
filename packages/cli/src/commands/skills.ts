/**
 * `holocron skills` — install, remove, and update agent skills from @theholocron/skills.
 *
 * Unlike `holocron setup`, this command is purely local (no GitHub token
 * required). It reads `agent` and `skills` from the config and installs
 * the listed skills into `.agents/skills/<name>/` with a symlink at the
 * agent-specific path (e.g. `.claude/skills/<name>` for Claude Code).
 *
 * `holocron skills remove [name]` and `holocron skills update [name]` delegate
 * to the corresponding `npx skills` subcommands from the upstream skills CLI.
 */

import { spawnSync } from "node:child_process";

import type { LoadedConfig } from "../config/load-config.js";
import type { RuntimeContext } from "../loader.js";
import { installSkills } from "./setup/index.js";

// ── shared exec ──────────────────────────────────────────────────────────────

type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { exitCode: number };

const defaultExec: ExecFn = (cmd, args, opts) => {
	const result = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};

// ── install ──────────────────────────────────────────────────────────────────

export interface RunSkillsInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	print?: (line: string) => void;
}

export async function runSkillsInstall(input: RunSkillsInput): Promise<void> {
	const print = input.print ?? ((line: string) => console.log(line));
	const config = input.loaded.resolved;

	if (!config.agent || !config.skills?.length) {
		print("Nothing to install — set `agent` and `skills` in holocron.config.ts");
		return;
	}

	if (input.context.dryRun) {
		print(`Would install ${config.skills.length} skill(s) for agent: ${config.agent}`);
		for (const name of config.skills) {
			print(`  → would install: ${name}`);
		}
		return;
	}

	print(`Installing ${config.skills.length} skill(s) for agent: ${config.agent}`);
	try {
		const result = await installSkills({
			agent: config.agent,
			skills: config.skills,
			repoRoot: input.context.repoRoot,
		});
		print(`  → ${result}`);
	} catch (err) {
		print(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
	}
}

// ── remove ───────────────────────────────────────────────────────────────────

export interface RunSkillsRemoveInput {
	context: RuntimeContext;
	/** Skill name(s) to remove. Omit to remove all installed skills. */
	names?: string[];
	exec?: ExecFn;
}

export interface SkillsRemoveReport {
	status: "ok" | "fail" | "dry-run";
}

export function runSkillsRemove(input: RunSkillsRemoveInput): SkillsRemoveReport {
	const { dryRun, repoRoot } = input.context;
	const exec = input.exec ?? defaultExec;
	const args = ["skills", "remove", ...(input.names ?? [])];

	if (dryRun) {
		console.log(`Would run: npx ${args.join(" ")}`);
		return { status: "dry-run" };
	}

	const { exitCode } = exec("npx", args, { cwd: repoRoot });
	return { status: exitCode === 0 ? "ok" : "fail" };
}

// ── update ───────────────────────────────────────────────────────────────────

export interface RunSkillsUpdateInput {
	context: RuntimeContext;
	/** When given, update only this skill. Omit to update all. */
	name?: string;
	exec?: ExecFn;
}

export interface SkillsUpdateReport {
	status: "ok" | "fail" | "dry-run";
}

export function runSkillsUpdate(input: RunSkillsUpdateInput): SkillsUpdateReport {
	const { dryRun, repoRoot } = input.context;
	const exec = input.exec ?? defaultExec;
	const args = ["skills", "update", ...(input.name ? [input.name] : [])];

	if (dryRun) {
		console.log(`Would run: npx ${args.join(" ")}`);
		return { status: "dry-run" };
	}

	const { exitCode } = exec("npx", args, { cwd: repoRoot });
	return { status: exitCode === 0 ? "ok" : "fail" };
}
