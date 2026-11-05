import type { CommandModule } from "yargs";

import { applyResolvedConfig, parseScope, resolveOrg, tokenContext } from "../../cli-support/index.js";
import { type GlobalArgs } from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { promptForPositionals } from "../../ui/index.js";
import { runSecretsSync, secretRoutes } from "./index.js";
import { type SecretsSyncArgs, secretsSyncArgs } from "./secrets-sync.args.js";

export const secretsSyncCommand: CommandModule<GlobalArgs, SecretsSyncArgs> = {
	command: "sync [environmentId]",
	describe: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
	builder: secretsSyncArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const githubSecretScope = parseScope(argv.githubSecretScope as string);
		const [environmentId] = await promptForPositionals(getEntry("secrets sync"), argv as Record<string, unknown>);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		// `--github-secret` describes one route by hand; without it, `repo.secrets.sync` says where each key goes.
		const routes = argv.githubSecret?.length
			? []
			: secretRoutes(loaded.resolved.repo?.secrets?.sync, environmentId!);
		const report = await runSecretsSync({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			environmentId: environmentId!,
			...(argv.projectId ? { projectId: argv.projectId } : {}),
			...(argv.worker ? { workerScript: argv.worker } : {}),
			...(argv.githubSecret?.length ? { githubSecretKeys: argv.githubSecret as string[] } : {}),
			githubSecretScope,
			...(routes.length ? { secretRoutes: routes } : {}),
			targets: argv.target as Array<"development" | "preview" | "production">,
		});
		if (report.summary.fail > 0) {
			process.exitCode = 1;
		}
	},
};
