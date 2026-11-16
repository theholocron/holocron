import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { uploadCoverageCommand } from "../upload-coverage/index.js";

export const uploadCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "upload",
	describe: "Upload what a run produced (coverage reports) to the service that keeps it",
	builder: (y: Argv<GlobalArgs>) => y.command(uploadCoverageCommand as never).command(groupMenu("upload") as never),
	handler: () => {},
};
