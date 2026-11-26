import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

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
		})
		.option("target", {
			type: "string",
			choices: ["github", "file"] as const,
			default: "github" as const,
			describe:
				"Where the value goes: `github` (the `secrets` capability) or `file` (the private import file, for a vault the CLI cannot write)",
		})
		.option("generate", {
			type: "boolean",
			default: false,
			describe: "Make the value with a random source (only for a secret the CLI generates, such as CRON_SECRET)",
		})
		.option("env", {
			type: "string",
			describe:
				"With --target file: the vault Environment the file is imported into (a layer word or a name), so the import is checked",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "With --target file: write without asking (required without a terminal)",
		});

export type SecretSetArgs = InferArgs<typeof secretSetArgs>;
