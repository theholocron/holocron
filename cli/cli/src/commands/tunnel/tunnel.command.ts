import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { tunnelUpCommand } from "../tunnel-up/index.js";

export const tunnelCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "tunnel <subcommand>",
	describe: "Tunnels from a stable public hostname to this machine",
	builder: (y: Argv<GlobalArgs>) => y.command(tunnelUpCommand as never).command(groupMenu("tunnel") as never),
	handler: () => {},
};
