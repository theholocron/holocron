import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

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
		})
		.option("record-file", {
			type: "string",
			describe:
				"A file the deploy lists the packages it deployed in (and `--record` reads), so a later step tags them.",
		})
		.option("record", {
			type: "boolean",
			default: false,
			describe:
				"Tag and push the `deployed/<package>` marker of each package in --record-file, using GITHUB_TOKEN. Deploys nothing.",
		});

export type DeployOnReleaseArgs = InferArgs<typeof deployOnReleaseArgs>;
