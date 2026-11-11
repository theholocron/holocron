import { checkbox } from "@inquirer/prompts";
import { NonInteractiveError } from "@theholocron/kyber/ui";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { type SkillsRemoveArgs, skillsRemoveArgs, type SkillsUpdateArgs, skillsUpdateArgs } from "./skills.args.js";
import { listInstalledSkills, runSkillsInstall, runSkillsList, runSkillsRemove, runSkillsUpdate } from "./skills.js";

const skillsInstall: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "install",
	describe: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
	builder: (y) => y,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		await runSkillsInstall({ loaded, context: { repoRoot: argv.cwd, dryRun: argv.dryRun } });
	},
};

/** `list skills`: the skills installed in `.agents/skills/`. */
export const skillsListCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "skills",
	describe: "List the skills installed in .agents/skills/",
	builder: (y) => y,
	handler: (argv) => {
		runSkillsList({ context: { repoRoot: argv.cwd, dryRun: argv.dryRun } });
	},
};

/**
 * What `remove skill` removes. Names win; `--all` means every installed skill; neither asks on a terminal and refuses
 * without one, so a bare call never removes everything by accident.
 */
async function skillsToRemove(argv: SkillsRemoveArgs): Promise<{ names?: string[] }> {
	const names = argv.names ?? [];
	if (names.length > 0 && argv.all) {
		throw new Error("remove skill: give the skill names or --all, not both");
	}
	if (names.length > 0) return { names };
	if (argv.all) return {};
	if (!process.stdin.isTTY) {
		throw new NonInteractiveError("remove skill: name the skills to remove, or pass --all to remove every one");
	}
	const installed = listInstalledSkills(argv.cwd);
	if (installed.length === 0) throw new Error("remove skill: no skills are installed in .agents/skills/");
	return { names: await checkbox({ message: "Skills to remove:", choices: installed }) };
}

/** `remove skill`: remove the named skills, or every one with `--all`. */
export const skillsRemoveCommand: CommandModule<GlobalArgs, SkillsRemoveArgs> = {
	command: "skill [names..]",
	describe: "Remove installed skills via npx skills remove (--all for every one)",
	builder: skillsRemoveArgs,
	handler: async (argv) => {
		const { names } = await skillsToRemove(argv);
		if (names?.length === 0) return;
		const report = runSkillsRemove({
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
			...(names?.length ? { names } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};

const skillsUpdate: CommandModule<GlobalArgs, SkillsUpdateArgs> = {
	command: "update [name]",
	describe: "Update installed skills to their latest upstream versions via npx skills update",
	builder: skillsUpdateArgs,
	handler: (argv) => {
		const report = runSkillsUpdate({
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
			...(argv.name ? { name: argv.name } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};

export const skillsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "skills",
	describe: "Manage agent skills from the @theholocron/skills registry",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(skillsInstall as never)
			.command(skillsUpdate as never)
			.command(groupMenu("skills") as never),
	handler: () => {},
};
