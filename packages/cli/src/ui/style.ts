import chalk from "chalk";

export const style = {
	success: (msg: string) => `${chalk.green("✓")} ${msg}`,
	warn: (msg: string) => `${chalk.yellow("⚠")} ${msg}`,
	fail: (msg: string) => `${chalk.red("✗")} ${msg}`,
	step: (msg: string) => `${chalk.cyan("→")} ${msg}`,
	hint: (msg: string) => chalk.dim(msg),
	dim: (msg: string) => chalk.dim(msg),
	header: (msg: string) => chalk.bold(msg),
};
