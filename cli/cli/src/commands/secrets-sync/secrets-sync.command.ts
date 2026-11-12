import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { assertSyncableLayer } from "../../credentials-environments/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { deployFilter, resolveEnvironmentId, runSecretsSync, secretRoutes, variableRoutes } from "./index.js";
import { parseScope } from "./parse-scope/index.js";
import { type SecretsSyncArgs, secretsSyncArgs } from "./secrets-sync.args.js";

export const secretsSyncCommand: CommandModule<GlobalArgs, SecretsSyncArgs> = {
	command: "secrets [environmentId]",
	describe: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
	builder: secretsSyncArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		// Only a scope given on the command line counts as naming a destination (#2104).
		const githubSecretScope = argv.githubSecretScope ? parseScope(argv.githubSecretScope as string) : undefined;
		const [environmentId] = await promptForPositionals(getEntry("sync secrets"), argv as Record<string, unknown>);
		// `local` and `dev` are read by this machine and never synced, whatever else is given (#2104).
		await assertSyncableLayer(environmentId!, { repoRoot: argv.cwd });
		const loaded = await loadConfig(argv.cwd);
		// A layer word (`prod`) names this repository's Environment of that layer; any other text is a literal name.
		const environment = await resolveEnvironmentId(environmentId!, { repoRoot: argv.cwd });
		applyResolvedConfig(argv, loaded.resolved);
		// `--github-secret` describes one route by hand; without it, `repo.secrets.sync` says where each key goes.
		const routes = argv.githubSecret?.length ? [] : secretRoutes(loaded.resolved.repo?.secrets?.sync, environment);
		// `repo.variables.sync` says which keys become Actions variables. An environment declared only that way must not
		// fall back to "every key is a repository secret", so it gets an explicit empty list of secret routes.
		const variables = variableRoutes(loaded.resolved.repo?.variables?.sync, environment);
		const variablesOnly = variables.length > 0 && routes.length === 0 && !argv.githubSecret?.length;
		const deploy = deployFilter(loaded.resolved.repo?.secrets?.deploy, environment);
		const report = await runSecretsSync({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			environmentId: environment,
			...(argv.projectId ? { projectId: argv.projectId } : {}),
			...(argv.worker ? { workerScript: argv.worker } : {}),
			// A deployment or Worker receives only what `repo.secrets.deploy` names; with no entry the run throws (#2061).
			...(deploy ? { deployFilter: deploy } : {}),
			...(argv.githubSecret?.length ? { githubSecretKeys: argv.githubSecret as string[] } : {}),
			...(githubSecretScope ? { githubSecretScope } : {}),
			...(routes.length ? { secretRoutes: routes } : variablesOnly ? { secretRoutes: [] } : {}),
			...(variables.length ? { variableRoutes: variables } : {}),
			targets: argv.target as Array<"development" | "preview" | "production">,
		});
		if (report.summary.fail > 0) {
			process.exitCode = 1;
		}
	},
};
