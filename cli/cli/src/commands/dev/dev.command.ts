import type { Argv, CommandModule } from "yargs";

import {
	applyResolvedConfig,
	type GlobalArgs,
	type InferArgs,
	resolveOrg,
	tokenContext,
} from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runDev } from "./dev.js";

const devArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.option("environment", {
			type: "string",
			demandOption: true,
			describe: "The vault environment whose variables the application runs with, e.g. 'Sentinel - dev'",
		})
		.option("name", {
			type: "string",
			demandOption: true,
			describe: "The tunnel's name",
		})
		.option("hostname", {
			type: "string",
			demandOption: true,
			describe: "The public hostname the tunnel serves, e.g. sentinel-dev.example.dev",
		})
		.option("port", {
			type: "number",
			default: 3000,
			describe: "The port the application listens on (given to it as PORT) and the tunnel sends requests to",
		});

type DevArgs = InferArgs<typeof devArgs>;

export const devCommand: CommandModule<GlobalArgs, DevArgs> = {
	command: "dev",
	describe:
		"Run an application locally behind its development tunnel, with its secrets from the vault (command after --)",
	builder: devArgs,
	handler: async (argv) => {
		const command = (argv["--"] as string[] | undefined) ?? [];
		if (command.length === 0) {
			throw new Error("dev needs the application's command after --, e.g. `holocron dev ... -- pnpm run serve`");
		}
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runDev({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			environment: argv.environment,
			name: argv.name,
			hostname: argv.hostname,
			port: argv.port,
			command,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
