import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const secretsSyncArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("environmentId", {
			type: "string",
			describe: "Vault environment id to read (1P Environment id, etc.)",
		})
		.option("project-id", {
			type: "string",
			describe: "Deployment project id (e.g., Vercel prj_*). Required when deployment is loaded.",
		})
		.option("target", {
			type: "array",
			default: ["production", "preview"] as Array<"development" | "preview" | "production">,
			describe: "Deployment targets to sync to. Defaults to production + preview.",
		})
		.option("worker", {
			type: "string",
			describe: "A deployed Worker (script name) to set every vault key on as a secret, e.g. comlink.",
		})
		.option("github-secret", {
			type: "array",
			describe: "Vault key(s) to push to GH Actions secrets (repeatable). Omit to push every key.",
		})
		.option("github-secret-scope", {
			type: "string",
			default: "repo",
			describe: 'Scope applied to every --github-secret key: "repo" (default), "env=<name>", or "org=<name>".',
		});

export type SecretsSyncArgs = InferArgs<typeof secretsSyncArgs>;
