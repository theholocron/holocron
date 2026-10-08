import chalk from "chalk";

export const style = {
	success: (msg: string) => `${chalk.green("✓")} ${msg}`,
	warn: (msg: string) => `${chalk.yellow("⚠")} ${msg}`,
	fail: (msg: string) => `${chalk.red("✗")} ${msg}`,
	step: (msg: string) => `${chalk.cyan("→")} ${msg}`,
	/** A dim `·` marker for a row that's neither a pass nor a failure — loaded but inactive, or skipped. */
	skip: (msg: string) => chalk.dim(`· ${msg}`),
	hint: (msg: string) => chalk.dim(msg),
	dim: (msg: string) => chalk.dim(msg),
	header: (msg: string) => chalk.bold(msg),
	/** Colored like `success`/`fail` but without the icon — a summary line that already states its own verdict in words. */
	successText: (msg: string) => chalk.green(msg),
	failText: (msg: string) => chalk.red(msg),
};
