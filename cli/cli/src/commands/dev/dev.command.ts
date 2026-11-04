import type { Argv, CommandModule } from "yargs";

import {
	applyResolvedConfig,
	type GlobalArgs,
	type InferArgs,
	resolveOrg,
	tokenContext,
} from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { resolveDevOptions } from "../resolve-dev-options/index.js";
import { runDev } from "./dev.js";

const devArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.option("environment", {
			type: "string",
			describe: "The vault environment whose variables the application runs with (default: `dev.environment`)",
		})
		.option("name", {
			type: "string",
			describe: "The tunnel's name (default: `dev.tunnel.name`)",
		})
		.option("hostname", {
			type: "string",
			describe: "The public hostname the tunnel serves (default: `dev.tunnel.hostname`)",
		})
		.option("port", {
			type: "number",
			describe:
				"The port the application listens on and the tunnel sends requests to (default: `dev.port`, then 3000)",
		});

type DevArgs = InferArgs<typeof devArgs>;

export const devCommand: CommandModule<GlobalArgs, DevArgs> = {
	command: "dev",
	describe:
		"Run an application locally behind its development tunnel, with its secrets from the vault (command after --)",
	builder: devArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const options = resolveDevOptions(
			{
				environment: argv.environment,
				name: argv.name,
				hostname: argv.hostname,
				port: argv.port,
				command: argv["--"] as string[] | undefined,
			},
			loaded.resolved.dev
		);
		const report = await runDev({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...options,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
