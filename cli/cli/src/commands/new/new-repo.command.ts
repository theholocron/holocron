import type { CommandModule } from "yargs";

import { tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { reportError } from "../../observability/logger/index.js";
import { NewError, runNew } from "./index.js";
import { type NewRepoArgs, newRepoArgs } from "./new-repo.args.js";
import { askNewRepoAnswers } from "./new-repo-wizard.js";

export const newRepoCommand: CommandModule<GlobalArgs, NewRepoArgs> = {
	command: "repo [type] [name]",
	describe: "Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
	builder: newRepoArgs,
	handler: async (argv) => {
		try {
			const tokens = tokenContext(argv.token);
			if (!tokens) return;
			const adminToken = tokens.cliTokens?.["github"] ?? tokens.cliToken;

			const answers = await askNewRepoAnswers(argv);
			const { type, name, description, homepage, vaultProvider, vaultProject, vaultConfig, deploymentProvider } =
				answers;
			const {
				agent,
				runtimeEnvironment,
				topics,
				protection,
				openSource,
				usesExternalPackages,
				skills,
				isTemplate,
			} = answers;
			if (!type) {
				reportError("new: template type is required");
				process.exitCode = 1;
				return;
			}
			if (!name) {
				reportError("new: repo name is required");
				process.exitCode = 1;
				return;
			}

			const report = await runNew({
				type,
				name,
				description: description || undefined,
				homepage,
				vaultProvider: (vaultProvider as "doppler" | "1password" | "infisical" | "none") ?? "none",
				vaultProject,
				vaultConfig,
				deploymentProvider: (deploymentProvider as "vercel" | "none") ?? "none",
				agent: (agent as "claude" | "none") ?? "claude",
				runtimeEnvironment: (runtimeEnvironment as "node" | "browser" | "universal" | "none") ?? "node",
				protection: protection ?? "strict",
				openSource: openSource ?? true,
				usesExternalPackages: usesExternalPackages ?? true,
				topics,
				skills,
				isTemplate,
				org: argv.org,
				token: adminToken,
				dryRun: argv.dryRun,
				noVerify: !argv.verify,
				cwd: argv.cwd,
			});
			if (report.status === "fail") process.exitCode = 1;
		} catch (err) {
			if (err instanceof NewError) {
				reportError(`new: ${err.message}`);
				process.exitCode = 1;
				return;
			}
			throw err;
		}
	},
};
