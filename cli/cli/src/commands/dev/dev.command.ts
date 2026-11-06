import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { devServeCommand } from "../dev-serve/dev-serve.command.js";
import { type GlobalArgs } from "../global-args/index.js";
import { resolveDevOptions } from "../resolve-dev-options/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
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
	builder: (y: Argv<GlobalArgs>) => devArgs(y).command(devServeCommand as never),
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
			loaded.resolved.dev,
			[process.execPath, process.argv[1] as string, "--cwd", argv.cwd]
		);
		const report = await runDev({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...options,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
