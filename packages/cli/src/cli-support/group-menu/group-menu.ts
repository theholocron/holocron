import type { CommandModule } from "yargs";

import { COMMAND_REGISTRY, launchMenu } from "../../interactive-menu/index.js";

/** Layer 2: a bare group command (`holocron repo`, `holocron repo upgrade`, …) opens the menu at that level. */
export async function launchGroupMenu(parent: string, argv: Record<string, unknown>): Promise<void> {
	await launchMenu(
		COMMAND_REGISTRY,
		argv,
		`${parent} — choose a subcommand:`,
		`Run \`holocron ${parent} --help\` to see available ${parent} subcommands.`,
		parent.split(" ")
	);
}

/** The hidden `$0` of a command group: bare `holocron <group>` opens the menu at that group. */
export const groupMenu = (parent: string): CommandModule<never, never> => ({
	command: "$0",
	describe: false,
	builder: (y) => y,
	handler: async (argv) => {
		await launchGroupMenu(parent, argv as Record<string, unknown>);
	},
});
