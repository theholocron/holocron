/**
 * `holocron install skills`, `list skills`, `remove skill` and `update skills` — install, list, remove and update
 * agent skills from @theholocron/skills.
 *
 * Unlike `holocron setup`, this command is purely local (no GitHub token
 * required). It reads `agent` and `skills` from the config and installs
 * the listed skills into `.agents/skills/<name>/` with a symlink at the
 * agent-specific path (e.g. `.claude/skills/<name>` for Claude Code).
 *
 * `holocron remove skill [name]` and `holocron update skills [name]` delegate
 * to the corresponding `npx skills` subcommands from the upstream skills CLI.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { installSkills } from "../setup/index.js";
import type {
	ExecFn,
	RunSkillsInput,
	RunSkillsListInput,
	RunSkillsRemoveInput,
	RunSkillsUpdateInput,
	SkillsListReport,
	SkillsRemoveReport,
	SkillsUpdateReport,
} from "./skills.type.js";

const defaultExec: ExecFn = (cmd, args, opts) => {
	const result = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
	return { exitCode: result.status ?? -1 };
};

export async function runSkillsInstall(input: RunSkillsInput): Promise<void> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const config = input.loaded.resolved;

	if (!config.agent || !config.skills?.length) {
		print("Nothing to install — set `agent` and `skills` in holocron.config.ts");
		logger.info({ status: "skip", reason: "no agent/skills configured" }, "install skills: done");
		return;
	}

	if (input.context.dryRun) {
		print(`Would install ${config.skills.length} skill(s) for agent: ${config.agent}`);
		for (const name of config.skills) {
			print(`  → would install: ${name}`);
		}
		logger.info({ agent: config.agent, skills: config.skills, status: "dry-run" }, "install skills: done");
		return;
	}

	print(`Installing ${config.skills.length} skill(s) for agent: ${config.agent}`);
	logger.info({ agent: config.agent, count: config.skills.length }, "install skills: start");
	try {
		const result = await installSkills({
			agent: config.agent,
			skills: config.skills,
			repoRoot: input.context.repoRoot,
		});
		print(`  → ${result}`);
		logger.info({ agent: config.agent, skills: config.skills, status: "ok" }, "install skills: done");
	} catch (err) {
		const message = errorMessage(err);
		print(`  ✗ ${message}`);
		logger.warn({ agent: config.agent, reason: message, status: "fail" }, "install skills: done");
	}
}

const readSkillDirs = (dir: string): string[] => {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
};

/** The names of the install skillsed in `.agents/skills/`, sorted. */
export function listInstalledSkills(repoRoot: string, readDir: (dir: string) => string[] = readSkillDirs): string[] {
	return readDir(join(repoRoot, ".agents", "skills")).sort();
}

export function runSkillsList(input: RunSkillsListInput): SkillsListReport {
	const print = input.print ?? ((line: string) => console.log(line));
	const skills = listInstalledSkills(input.context.repoRoot, input.readDir);
	if (skills.length === 0) {
		print("No install skillsed in .agents/skills/");
	}
	for (const name of skills) print(name);
	return { status: "ok", skills };
}

export function runSkillsRemove(input: RunSkillsRemoveInput): SkillsRemoveReport {
	const { dryRun, repoRoot } = input.context;
	const exec = input.exec ?? defaultExec;
	const logger = input.logger ?? getLogger();
	const args = ["skills", "remove", ...(input.names ?? [])];

	if (dryRun) {
		logger.info({ argv: args }, `Would run: npx ${args.join(" ")}`);
		return { status: "dry-run" };
	}

	const { exitCode } = exec("npx", args, { cwd: repoRoot });
	return { status: exitCode === 0 ? "ok" : "fail" };
}

export function runSkillsUpdate(input: RunSkillsUpdateInput): SkillsUpdateReport {
	const { dryRun, repoRoot } = input.context;
	const exec = input.exec ?? defaultExec;
	const logger = input.logger ?? getLogger();
	const args = ["skills", "update", ...(input.name ? [input.name] : [])];

	if (dryRun) {
		logger.info({ argv: args }, `Would run: npx ${args.join(" ")}`);
		return { status: "dry-run" };
	}

	const { exitCode } = exec("npx", args, { cwd: repoRoot });
	return { status: exitCode === 0 ? "ok" : "fail" };
}
