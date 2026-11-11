import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { runAuthExport } from "./auth-export.js";
import type { AuthExportTarget } from "./auth-export.type.js";
import { stdoutKind } from "./stdout-kind/index.js";

const authExportArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.option("from-env", {
			type: "boolean",
			default: false,
			describe:
				"Also take a token that is set in the environment (HOLOCRON_<X> or the vendor's name), ahead of the keyring",
		})
		.option("file", {
			type: "string",
			describe:
				"Write the tokens to this private file (mode 0600; default .holocron/.private/.credentials) instead of stdout; on a terminal this is the default",
		})
		.option("only", {
			type: "string",
			array: true,
			describe:
				"Export only this token, by variable name (HOLOCRON_SENTRY_TOKEN), the vendor's name or its keyring entry (sentry.comlink); NAME=value writes a setting as given; repeat for more. On a terminal it goes to the clipboard",
		})
		.option("blank", {
			type: "boolean",
			default: false,
			describe:
				'Write a name with no stored value as NAME="" instead of leaving it out, and let --only name a variable that is no token (also written empty), so the file creates every variable an environment needs',
		})
		.option("vendor-names", {
			type: "boolean",
			default: false,
			describe:
				"Write a token under the vendor's own name (SENTRY_AUTH_TOKEN) when it has one, not the Holocron name",
		})
		.option("copy", {
			type: "boolean",
			conflicts: "file",
			describe: "Put the tokens on the clipboard instead (a multi-line paste lands in one field in some apps)",
		})
		.option("keep", {
			type: "boolean",
			default: false,
			describe: "Leave the file in place after writing it instead of deleting it once the import is done",
		})
		.option("force", {
			type: "boolean",
			default: false,
			describe: "Replace the file if it is already there (it is never overwritten otherwise)",
		});

type AuthExportArgs = InferArgs<typeof authExportArgs>;

export const authExportCommand: CommandModule<GlobalArgs, AuthExportArgs> = {
	command: "export",
	describe:
		"Write the stored tokens as NAME=value lines to a private, short-lived file (or the clipboard, or a pipe) to move them into a credentials environment",
	builder: authExportArgs,
	handler: async (argv) => {
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const org = resolveOrg(argv, loaded.resolved);
		// `--file` with no path is the default file; `--file` or `--copy` is an explicit choice of where to write.
		const to: AuthExportTarget | undefined = argv.copy ? "clipboard" : argv.file !== undefined ? "file" : undefined;
		const report = await runAuthExport({
			loaded,
			out: (text) => void process.stdout.write(text),
			outKind: stdoutKind(process.stdout.isTTY === true),
			fromEnv: argv.fromEnv,
			...(argv.only?.length ? { only: argv.only } : {}),
			blank: argv.blank,
			vendorNames: argv.vendorNames,
			...(org ? { org } : {}),
			...(to ? { to } : {}),
			...(argv.file ? { file: argv.file } : {}),
			force: argv.force,
			keep: argv.keep,
			interactive: process.stdin.isTTY === true,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
