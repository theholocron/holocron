import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, launchGroupMenu } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { type SkillsRemoveArgs, skillsRemoveArgs, type SkillsUpdateArgs, skillsUpdateArgs } from "./skills.args.js";
import { runSkillsInstall, runSkillsRemove, runSkillsUpdate } from "./skills.js";

const skillsInstall: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "install",
	describe: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
	builder: (y) => y,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		await runSkillsInstall({ loaded, context: { repoRoot: argv.cwd, dryRun: argv.dryRun } });
	},
};

const skillsRemove: CommandModule<GlobalArgs, SkillsRemoveArgs> = {
	command: "remove [names..]",
	describe: "Remove installed skills via npx skills remove",
	builder: skillsRemoveArgs,
	handler: (argv) => {
		const report = runSkillsRemove({
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
			...(argv.names?.length ? { names: argv.names } : {}),
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

/** Bare `holocron skills`: a menu of the subcommands (hidden from --help). */
const skillsMenu: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "$0",
	describe: false,
	builder: (y) => y,
	handler: async (argv) => {
		await launchGroupMenu("skills", argv);
	},
};

export const skillsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "skills",
	describe: "Manage agent skills from the @theholocron/skills registry",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(skillsInstall as never)
			.command(skillsRemove as never)
			.command(skillsUpdate as never)
			.command(skillsMenu as never),
	handler: () => {},
};
