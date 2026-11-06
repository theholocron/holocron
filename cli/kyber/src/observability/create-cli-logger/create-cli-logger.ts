import type { Logger, LogLevel } from "@theholocron/observability/core";
import { createLogger, resolveAxiomFromEnv } from "@theholocron/observability/logger";

import { allowProgress, style } from "../../ui/index.js";
import { resolveConsoleOutput } from "../resolve-console-output/index.js";
import { resolveLogLevel } from "../resolve-log-level/index.js";
import type { BuildCliLoggerOpts, CliLogger, CreateCliLoggerOptions, LogFlags } from "./create-cli-logger.type.js";

/**
 * Create a CLI's logging functions around a memoized root `Logger`.
 *
 * Level comes from `--log` / `--verbose` / `--quiet`, then
 * `<PREFIX>_LOG_LEVEL`, then the config file. Console output is quiet unless
 * CI or a flag asks for it. `--quiet` and `--log` also turn the progress
 * spinner off (`allowProgress`), as they own the terminal.
 *
 * @example
 * const { buildCliLogger, getLogger, reportError } = createCliLogger({ envPrefix: "ACME" });
 */
export function createCliLogger(options: CreateCliLoggerOptions): CliLogger {
	const { envPrefix, resolveAxiom = () => resolveAxiomFromEnv() } = options;

	let root: { logger: Logger; runId: string } | undefined;
	let rootLevel: LogLevel | undefined;
	let rootCommand: string | undefined;
	let rootAxiomKey: string | undefined;

	const levelFor = (argv: LogFlags, configLevel?: LogLevel): LogLevel | undefined =>
		resolveLogLevel(envPrefix, argv, configLevel);

	function buildCliLogger(argv: LogFlags, opts: BuildCliLoggerOpts = {}): { logger: Logger; runId: string } {
		const { command, configLevel } = opts;
		allowProgress(!argv.quiet && !argv.log);
		if (command) rootCommand = command;
		const level = levelFor(argv, configLevel);
		const consoleOutput = resolveConsoleOutput(argv);
		const axiom = resolveAxiom(opts, { command: command ?? rootCommand });
		const axiomKey = axiom?.dataset;
		const rebuildForConfig =
			configLevel !== undefined && level !== rootLevel && !argv.verbose && !argv.quiet && !argv.log;
		const rebuildForAxiom = axiomKey !== undefined && axiomKey !== rootAxiomKey;
		if (!root || rebuildForConfig || rebuildForAxiom) {
			const built = createLogger({
				...(level ? { level } : {}),
				...(axiom ? { axiom } : {}),
				...(consoleOutput !== undefined ? { consoleOutput } : {}),
			});
			root = {
				logger: rootCommand ? built.logger.child({ command: rootCommand }) : built.logger,
				runId: built.runId,
			};
			rootLevel = level;
			rootAxiomKey = axiomKey;
		}
		return root;
	}

	function getLogger(): Logger {
		return (root ??= createLogger({ consoleOutput: resolveConsoleOutput({}) })).logger;
	}

	return {
		buildCliLogger,
		getLogger,
		reportError(message: string, log: Logger = getLogger()): void {
			console.error(style.fail(message));
			log.error(message);
		},
		getRunId: () => root?.runId,
		resetCliLogger(): void {
			root = undefined;
			rootLevel = undefined;
			rootCommand = undefined;
			rootAxiomKey = undefined;
		},
		resolveLogLevel: levelFor,
	};
}
