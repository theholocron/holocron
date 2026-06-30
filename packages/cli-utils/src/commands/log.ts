import fs from "fs";
import readline from "readline";
import chalk from "chalk";
import type { CommandBuilder } from "yargs";
import { type CLIOptions } from "@/cli";
import { config, type LogLevel } from "@/utils";

export interface LogOpts extends CLIOptions {
	level?: LogLevel;
	maxLines?: number;
}

export const levels: Record<LogLevel, string> = {
	all: "log",
	error: "error.log",
	warn: "warn.log",
	info: "info.log",
	verbose: "verbose.log",
	debug: "debug.log",
};

export const builder: CommandBuilder<LogOpts, LogOpts> = (yargs) =>
	yargs.options({
		l: {
			alias: ["level", "log-level"],
			choices: Object.keys(levels) as LogLevel[],
			default: "all",
			demandOption: true,
			describe: "The log level to show",
		},
		o: {
			alias: ["output", "max-lines"],
			default: 20,
			describe: "Maximum number of lines to show, from the end of the file",
			type: "number",
		},
	});
export const command: string = "log";
export const desc: string = "Print out the logs";

/**
 * Reads and displays the last `maxLines` lines from a log file with enhanced formatting.
 *
 * @param {string} [level='all'] - The log level to read (e.g., 'all', 'error'). Defaults to 'all'.
 * @param {number} [maxLines] - The number of lines to display from the end of the log file. If not provided, displays the entire file.
 */
export async function handler(options: LogOpts): Promise<void> {
	const { level, maxLines } = options;
	const logFilePath = `${config.get("preferences.logs")}/${levels[level || "all"] || levels.all}`;
	const fileStream = fs.createReadStream(logFilePath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	const lines: { number: number; content: string }[] = [];
	let lineNumber = 0;

	rl.on("line", (line: string) => {
		lineNumber++;
		lines.push({ number: lineNumber, content: line });
		if (maxLines !== undefined && lines.length > maxLines) {
			lines.shift();
		}
	});

	await new Promise<void>((resolve) => rl.on("close", resolve));

	// Define chalk styles
	const timestampStyle = chalk.yellow;
	const levelStyle = chalk.bold.red;
	const messageStyle = chalk.white;
	const bracketStyle = chalk.magenta;

	lines.forEach(({ number, content }) => {
		const match = content.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (\w+): (.+)/);
		if (match) {
			let [, timestamp, level, message] = match;

			// Apply magenta style to bracketed content
			message = message.replace(/\[([^\]]+)\]/g, (match, p1) => `${bracketStyle(`[${p1}]`)}`);
			console.log(
				`${chalk.gray(number)}: ${timestampStyle(`[${timestamp}]`)} ${levelStyle(level)}: ${messageStyle(message)}`
			);
		} else {
			// Apply magenta style to bracketed content in lines that don't match the main pattern
			content = content.replace(/\[([^\]]+)\]/g, (match, p1) => `${bracketStyle(`[${p1}]`)}`);
			console.log(`${chalk.gray(number)}: ${content}`); // If the line doesn't match the expected format, print it as is with line number
		}
	});
}
