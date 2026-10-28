import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const secretSetArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("name", {
			type: "string",
			describe: "Secret name (e.g., NPM_TOKEN)",
		})
		.positional("value", {
			type: "string",
			describe:
				"Secret value (positional). If omitted, sources from --from-stdin, --from-env, or env var matching <name>.",
		})
		.option("from-stdin", {
			type: "boolean",
			default: false,
			describe: "Read the secret value from stdin",
		})
		.option("from-env", {
			type: "string",
			describe: "Read the secret value from the named env var (otherwise: env var matching <name>)",
		})
		.option("scope", {
			type: "string",
			default: "repo",
			describe: 'Scope: "repo" (default), "env=<name>", or "org=<name>"',
		});

export type SecretSetArgs = InferArgs<typeof secretSetArgs>;
