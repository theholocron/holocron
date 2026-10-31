import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const secretsListArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("scope", {
			type: "string",
			choices: ["repo", "environment", "organization"] as const,
			describe: "List one scope. Omitted: the repository, plus the organization and the --env environment.",
		})
		.option("env", {
			type: "string",
			describe: "The environment to list (adds it to the default scopes; required with --scope environment).",
		})
		.option("json", {
			type: "boolean",
			default: false,
			describe: "Print one JSON document: [{ scope, names, error? }]",
		});

export type SecretsListArgs = InferArgs<typeof secretsListArgs>;
