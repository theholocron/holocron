import { confirm } from "@inquirer/prompts";
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
	describe: "Set a single secret via the configured `secrets` capability, or hand a new one to a vault by file",
	builder: secretSetArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const [name] = await promptForPositionals(getEntry("new secret"), argv);
		const scopeArg = argv.scope;
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
			name: name,
			...(argv.value ? { value: argv.value } : {}),
			...(argv.fromStdin ? { fromStdin: true } : {}),
			...(argv.fromEnv ? { fromEnv: argv.fromEnv } : {}),
			scope,
			target: argv.target,
			...(argv.generate ? { generate: true } : {}),
			...(argv.env ? { environment: argv.env } : {}),
			...(argv.yes ? { yes: true } : {}),
			// Only a terminal can be asked; without one `--yes` is required.
			...(process.stdin.isTTY === true
				? { confirm: (message: string) => confirm({ message, default: false }) }
				: {}),
		});
		if (report.status === "fail") {
			process.exitCode = 1;
		}
	},
};
