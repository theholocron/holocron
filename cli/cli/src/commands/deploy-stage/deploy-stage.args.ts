import type { Argv } from "yargs";

import type { InferArgs } from "../../cli-support/index.js";
import type { DeployArgs } from "../deploy/deploy.args.js";

export const deployStageArgs = (y: Argv<DeployArgs>) =>
	y
		.option("package-dir", {
			type: "string",
			describe: "The package to stage. Default: the current directory.",
		})
		.option("out", {
			type: "string",
			describe: "Where to write the payload. Default: `.vercel-deploy` inside the package.",
		});

export type DeployStageArgs = InferArgs<typeof deployStageArgs>;
