#!/usr/bin/env npx tsx

import * as str from "@theholocron/utils-string";
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

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
yargs(hideBin(process.argv))
	.usage("Usage: $0 <command> [options]")
	.commandDir(__cmddir("./commands"), {
		extensions: ["ts"],
	})
	.demandCommand()
	.env("HOLOCRON")
	.completion()
	.recommendCommands()
	.options({
		d: {
			alias: ["debug"],
			default: utils.config.get("preferences.debug") || str.toBoolean(env?.HOLOCRON_DEBUG) || false,
			describe: "Turn on debugging mode",
			type: "boolean",
			global: true,
			hidden: true,
		},
		s: {
			alias: ["sound"],
			default: utils.config.get("preferences.sound") || str.toBoolean(env?.HOLOCRON_SOUND) || false,
			describe: "Turn on sound effects",
			type: "boolean",
			global: true,
			hidden: true,
		},
		verbose: {
			default: str.toBoolean(env?.HOLOCRON_VERBOSE) || false,
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
