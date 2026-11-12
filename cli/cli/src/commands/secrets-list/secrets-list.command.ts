import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSecretsList, secretsListScopes } from "./index.js";
import { type SecretsListArgs, secretsListArgs } from "./secrets-list.args.js";

export const secretsListCommand: CommandModule<GlobalArgs, SecretsListArgs> = {
	command: "secrets",
	describe: "List the names of the secrets at each scope (never the values)",
	builder: secretsListArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const org = resolveOrg(argv, loaded.resolved);
		const scopes = secretsListScopes({
			...(argv.scope ? { scope: argv.scope } : {}),
			...(argv.env ? { env: argv.env } : {}),
			...(org ? { org } : {}),
		});
		const report = await runSecretsList({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: false, ...tokens, org },
			scopes,
			json: argv.json,
		});
		if (report.failed > 0) {
			process.exitCode = 1;
		}
	},
};
