import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const secretsSyncArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("environmentId", {
			type: "string",
			describe:
				"Vault environment to read: a layer (local, dev, ci, prod) of this repository, or an Environment name",
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
			describe:
				"Vault key(s) to push to GH Actions secrets (repeatable). Names the destination when `repo.secrets.sync` has no entry.",
		})
		.option("github-secret-scope", {
			type: "string",
			describe:
				'Scope applied to every --github-secret key: "repo", "env=<name>", or "org=<name>". Naming it counts as naming the destination.',
		});

export type SecretsSyncArgs = InferArgs<typeof secretsSyncArgs>;
