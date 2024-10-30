#!/usr/bin/env npx tsx

import * as path from "node:path";
import updateNotifier from "update-notifier";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { __cmddir } from "@/const";
import pkg from "@/package";
import * as utils from "@/utils";

const [, env] = utils.env.read();

export interface CLIOptions {
	d?: boolean;
	debug?: boolean;
	s?: boolean;
	sound?: boolean;
	verbose?: boolean;
	// spinner: Ora;
}

yargs(hideBin(process.argv))
	.usage("Usage: $0 <command> [options]")
	.commandDir(__cmddir("./commands"), {
		extensions: ["ts"],
	})
	.demandCommand()
	.env("CLI_TEMPLATE")
	.completion()
	.recommendCommands()
	.options({
		d: {
			alias: ["debug"],
			default: utils.config.get("preferences.debug") || utils.str.toBoolean(env?.CLI_TEMPLATE_DEBUG) || false,
			describe: "Turn on debugging mode",
			type: "boolean",
			global: true,
			hidden: true,
		},
		s: {
			alias: ["sound"],
			default: utils.config.get("preferences.sound") || utils.str.toBoolean(env?.CLI_TEMPLATE_SOUND) || false,
			describe: "Turn on sound effects",
			type: "boolean",
			global: true,
			hidden: true,
		},
		verbose: {
			default: utils.str.toBoolean(env?.CLI_TEMPLATE_VERBOSE) || false,
			describe: "Turn on logging",
			type: "boolean",
			global: true,
		},
	})
	.alias({
		h: "help",
		v: "version",
	})
	.strict()
	.help("h")
	.version()
	.epilogue(`© 2024-${new Date().getFullYear()} The Holocron, Inc. All rights reserved.`).argv as CLIOptions;

updateNotifier({ pkg }).notify();
