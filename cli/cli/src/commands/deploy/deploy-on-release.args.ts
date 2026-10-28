import type { Argv } from "yargs";

import type { InferArgs } from "../../cli-support/index.js";
import type { DeployArgs } from "./deploy.args.js";

export const deployOnReleaseArgs = (y: Argv<DeployArgs>) =>
	y
		.option("channel", {
			type: "string",
			default: "",
			describe:
				"The release's channel: its prerelease identifier (`alpha`); empty or `main` for a stable release.",
		})
		.option("from", {
			type: "string",
			describe: "The previous release's commit, to diff against. Omit when there is none.",
		})
		.option("to", {
			type: "string",
			describe: "The release commit. Default HEAD.",
		});

export type DeployOnReleaseArgs = InferArgs<typeof deployOnReleaseArgs>;
