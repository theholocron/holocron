import chalk from "chalk";

/** Formats a message with a status marker and colour: one helper per kind of line a command prints. */
export const style = {
	/** A green `✓` for something that worked. */
	success: (msg: string) => `${chalk.green("✓")} ${msg}`,
	/** A yellow `⚠` for something worth a second look. */
	warn: (msg: string) => `${chalk.yellow("⚠")} ${msg}`,
	/** A red `✗` for something that failed. */
	fail: (msg: string) => `${chalk.red("✗")} ${msg}`,
	/** A cyan `→` for a step being taken. */
	step: (msg: string) => `${chalk.cyan("→")} ${msg}`,
	/** A dim `·` marker for a row that's neither a pass nor a failure — loaded but inactive, or skipped. */
	skip: (msg: string) => chalk.dim(`· ${msg}`),
	/** Dimmed text for a suggestion or a next step. */
	hint: (msg: string) => chalk.dim(msg),
	/** Dimmed text for detail that should recede. */
	dim: (msg: string) => chalk.dim(msg),
	/** Bold text for a heading. */
	header: (msg: string) => chalk.bold(msg),
};
