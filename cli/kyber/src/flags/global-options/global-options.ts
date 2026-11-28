import type { Argv } from "yargs";

import type { GlobalOptionsOptions } from "./global-options.type.js";

/**
 * Declares the options every command of a tool takes, once, on the root parser: `--dry-run`, a repeatable `--token`
 * (a bare value, or `vendor=value`, parsed by `parseTokenArgs`) and `--cwd`. A tool adds its own to the same parser;
 * a command module's arguments extend {@link GlobalArgs}.
 */
export function addGlobalOptions(parser: Argv, options: GlobalOptionsOptions = {}): Argv {
	const describe = options.describe ?? {};
	return parser
		.option("dry-run", {
			type: "boolean",
			default: false,
			describe: describe.dryRun ?? "Print what would change without changing it. Read-only commands ignore it.",
		})
		.option("token", {
			type: "string",
			array: true,
			describe:
				describe.token ??
				"Token override. Bare form: --token <value>. Keyed form: --token vendor=value (repeat for each vendor).",
		})
		.option("cwd", {
			type: "string",
			default: options.cwd ?? process.cwd(),
			describe: describe.cwd ?? "The directory to work from",
		});
}
