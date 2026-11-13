import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export interface ProbeArgs extends GlobalArgs {
	provider?: string;
	probe?: string;
	args?: string[];
	lcov?: string;
	warn?: boolean;
	files?: boolean;
	only?: string[];
	copy?: boolean;
	environment?: string;
	yes: boolean;
}

/**
 * Shown in `holocron probe --help`: how a probe about a token (`cloudflare token`) picks the token it checks, so the
 * run itself prints only the result.
 */
export const TOKEN_PROBE_HELP = [
	"Probes about a token (for example `holocron probe cloudflare token`) check one token. The first of these that applies picks it:",
	[
		"- --token <provider>=<value>: that token (a bare --token <value> goes to every provider).",
		"- --environment <layer or name>: the provider's token, read from that vault Environment.",
		"- On a terminal, with neither: a question, which asks for the configured token, an Environment or a pasted token.",
		"- Otherwise: the token the provider normally resolves.",
	].join("\n"),
	"--environment takes a layer (local, dev, ci or prod, which is this repo's `<org/repo> - <layer>`) or an Environment the config already names; anything else is refused. `local` is read over `dev`, as the CLI reads it.",
	"A token read from a layer is checked against what that layer's token should carry (the permission table in the tokens docs): what it should have must be there and what it should not have must not be. Any other token is only described. The token is never printed.",
].join("\n\n");

export const probeArgs = (y: Argv<GlobalArgs>): Argv<ProbeArgs> =>
	y
		.positional("provider", {
			type: "string",
			describe: "Which provider's probes (omit to list them all)",
		})
		.positional("probe", {
			type: "string",
			describe: "Which probe to run (omit to list the provider's)",
		})
		.positional("args", {
			type: "string",
			array: true,
			describe: "Arguments for the probe (`probe deps who <name>`)",
		})
		.option("lcov", {
			type: "string",
			describe: "Also write the coverage a `docs` probe measures to this lcov file (relative to the repo root)",
		})
		.option("warn", {
			type: "boolean",
			describe: "`tasks names`: report each old task name as an info row instead of failing",
		})
		.option("files", {
			type: "boolean",
			describe:
				"`tasks names`: also report old names that are part of a workflow file name (`delivery.build.yml`)",
		})
		.option("only", {
			type: "string",
			array: true,
			nargs: 1,
			describe: "`1password export-environment`: export only this variable; repeat for more",
		})
		.option("copy", {
			type: "boolean",
			describe: "`1password export-environment`: put the variables on the clipboard instead of a file",
		})
		.option("environment", {
			type: "string",
			describe:
				"A probe about a token (`cloudflare token`): check the provider's token held in this vault Environment (a layer such as `ci` or `dev`, or a name)",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Run a probe that changes things without asking first (required without a terminal)",
		})
		.epilogue(TOKEN_PROBE_HELP);
