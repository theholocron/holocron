import type { Argv, CommandModule } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runAuthExport } from "./auth-export.js";
import { stdoutKind } from "./stdout-kind/index.js";

const authExportArgs = (yy: Argv<GlobalArgs>) =>
	yy.option("from-env", {
		type: "boolean",
		default: false,
		describe:
			"Also take a token that is set in the environment (HOLOCRON_<X> or the vendor's name), ahead of the keyring",
	});

type AuthExportArgs = InferArgs<typeof authExportArgs>;

export const authExportCommand: CommandModule<GlobalArgs, AuthExportArgs> = {
	command: "export",
	describe:
		"Copy the stored tokens as NAME=value lines (or write them to a pipe) to move them into a credentials environment",
	builder: authExportArgs,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		const report = await runAuthExport({
			loaded,
			out: (text) => void process.stdout.write(text),
			outKind: stdoutKind(process.stdout.isTTY === true),
			fromEnv: argv.fromEnv,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
