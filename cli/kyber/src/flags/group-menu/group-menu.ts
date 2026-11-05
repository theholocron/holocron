import type { CommandModule } from "yargs";

/**
 * The hidden default command (`$0`) of a command group, so that typing just the group (`tool repo`) does something
 * useful: `open` is called with the group's name and the parsed arguments, usually to open a menu of its subcommands.
 */
export const groupMenu = (
	parent: string,
	open: (parent: string, argv: Record<string, unknown>) => Promise<void>
): CommandModule<never, never> => ({
	command: "$0",
	describe: false,
	builder: (y) => y,
	handler: async (argv) => {
		await open(parent, argv as Record<string, unknown>);
	},
});
