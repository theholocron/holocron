import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";
import { runGithubAppCreate } from "./github-app-create.js";

const githubAppCreateArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.option("name", {
			type: "string",
			demandOption: true,
			describe: "The App's name; unique across all of GitHub",
		})
		.option("webhook-url", {
			type: "string",
			demandOption: true,
			describe: "The https URL GitHub delivers webhooks to (your tunnel's address and /api/webhook)",
		})
		.option("manifest", {
			type: "string",
			demandOption: true,
			describe: "JSON file with default_permissions, default_events and optionally description, url, public",
		})
		.option("webhook-secret-var", {
			type: "string",
			default: "SENTINEL_WEBHOOK_SECRET",
			describe: "The variable the webhook secret is written as",
		})
		.option("file", {
			type: "string",
			describe: "Write the credentials to this private file (mode 0600; default .holocron/.private/.credentials)",
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

type GithubAppCreateArgs = InferArgs<typeof githubAppCreateArgs>;

export const githubAppCreateCommand: CommandModule<GlobalArgs, GithubAppCreateArgs> = {
	command: "github-app",
	describe: "Create a GitHub App from a manifest and keep its credentials in a private file to import",
	builder: githubAppCreateArgs,
	handler: async (argv) => {
		const report = await runGithubAppCreate({
			dir: argv.cwd,
			manifest: argv.manifest,
			name: argv.name,
			webhookUrl: argv.webhookUrl,
			org: argv.org,
			webhookSecretVar: argv.webhookSecretVar,
			file: argv.file,
			keep: argv.keep,
			force: argv.force,
			interactive: process.stdin.isTTY === true,
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
