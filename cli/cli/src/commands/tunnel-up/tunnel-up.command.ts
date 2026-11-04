import type { Argv, CommandModule } from "yargs";

import {
	applyResolvedConfig,
	type GlobalArgs,
	type InferArgs,
	resolveOrg,
	tokenContext,
} from "../../cli-support/index.js";
import { loadConfig } from "../../config/index.js";
import { runTunnelUp } from "./tunnel-up.js";

const tunnelUpArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.option("name", {
			type: "string",
			demandOption: true,
			describe: "The tunnel's name; a second run finds the first one's tunnel by it",
		})
		.option("hostname", {
			type: "string",
			demandOption: true,
			describe: "The public hostname the tunnel serves, e.g. sentinel-dev.example.dev",
		})
		.option("port", {
			type: "number",
			default: 3000,
			describe: "The local port requests are sent to",
		})
		.option("run", {
			type: "boolean",
			default: false,
			describe: "Run the tunnel in the foreground once it is set up (needs cloudflared; Ctrl-C stops it)",
		});

type TunnelUpArgs = InferArgs<typeof tunnelUpArgs>;

export const tunnelUpCommand: CommandModule<GlobalArgs, TunnelUpArgs> = {
	command: "up",
	describe: "Make a named tunnel with a stable public hostname that reaches a local port",
	builder: tunnelUpArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runTunnelUp({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			name: argv.name,
			hostname: argv.hostname,
			port: argv.port,
			run: argv.run,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
