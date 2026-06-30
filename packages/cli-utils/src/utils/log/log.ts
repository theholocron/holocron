import chalk from "chalk";
import { type CLIOptions } from "@/cli";
import { logger } from "./logger";
import { sound } from "./sound";

type LoggerFunction = (prefix: string, message: string, options?: CLIOptions) => void;

const bold = (str: string) => chalk.magenta.bold(str);

const data = (prefix: string, key: string, message: any, options: CLIOptions) => {
	options?.debug && console.log(chalk.cyan(`[${prefix}]:`), chalk.bgWhiteBright(`${key}:`), message);
};

const error: LoggerFunction = (prefix, message, options) => {
	logger.error(`[${prefix}] error: ${message}`);

	console.log(chalk.red.bold(message));
	options?.sound && sound.error();
};

const info: LoggerFunction = (prefix, message, options) => {
	logger.info(`[${prefix}] info: ${message}`);

	options?.debug && console.log(chalk.cyan(`[${prefix}]:`), message);
};

const processing: LoggerFunction = (prefix, message, options) => {
	logger.info(`[${prefix}] processing: ${message}`);

	options?.debug && console.log(chalk.magenta(`[${prefix}]:`), message);
};

const success: LoggerFunction = (prefix, message, options) => {
	logger.info(`[${prefix}] success: ${message}`);

	console.log(chalk.green.bold(message));
	options?.sound && sound.success();
};

const warning: LoggerFunction = (prefix, message, options) => {
	logger.warn(`[${prefix}] warning: ${message}`);

	console.log(chalk.yellow.bold(message));
	options?.sound && sound.warning();
};

export const log = {
	bold,
	data,
	error,
	info,
	process: processing,
	success,
	style: {
		bold,
	},
	warning,
};
