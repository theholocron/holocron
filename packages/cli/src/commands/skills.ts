/**
 * `holocron skills` — install agent skills from @theholocron/skills.
 *
 * Unlike `holocron setup`, this command is purely local (no GitHub token
 * required). It reads `agent` and `skills` from the config and installs
 * the listed skills into `.agents/skills/<name>/` with a symlink at the
 * agent-specific path (e.g. `.claude/skills/<name>` for Claude Code).
 */

import type { LoadedConfig } from "../load-config.js";
import type { RuntimeContext } from "../loader.js";
import { installSkills } from "./setup.js";

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
	const result = await installSkills({
		agent: config.agent,
		skills: config.skills,
		repoRoot: input.context.repoRoot,
	});
	print(`  → ${result}`);
}
