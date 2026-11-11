import { promptForPositionals } from "@theholocron/kyber/prompts";
import type { CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { getEntry } from "../../interactive-menu/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { parseScope } from "../secrets-sync/parse-scope/index.js";
import { tokenContext } from "../token-context/index.js";
import { runSecretSet } from "./index.js";
import { type SecretSetArgs, secretSetArgs } from "./secret-set.args.js";

export const secretSetCommand: CommandModule<GlobalArgs, SecretSetArgs> = {
	command: "secret [name] [value]",
	describe: "Set a single secret via the configured `secrets` capability",
	builder: secretSetArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [name] = await promptForPositionals(getEntry("new secret"), argv as Record<string, unknown>);
		const scopeArg = argv.scope as string;
		const scope = parseScope(scopeArg);
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runSecretSet({
			loaded,
			context: {
				repoRoot: argv.cwd,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			},
			name: name!,
			...(argv.value ? { value: argv.value as string } : {}),
			...(argv.fromStdin ? { fromStdin: true } : {}),
			...(argv.fromEnv ? { fromEnv: argv.fromEnv as string } : {}),
			scope,
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
