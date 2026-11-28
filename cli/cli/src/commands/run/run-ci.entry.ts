import { type MenuEntry } from "@theholocron/kyber/menu";

/** The options of `run` that the menu does not offer; the entries it builds for each task share this (`run ci` also offers `--all`). */
export const RUN_SKIP_OPTIONS = ["check", "required", "filter", "affected", "base"];

export const runCiEntry: MenuEntry = {
	name: "run ci",
	description: "Run the merge-gating checks locally, in CI order — 'will CI pass?'",
	positionals: [],
	options: [
		{
			key: "all",
			flag: "--all",
			type: "confirm",
			default: false,
			message: "Run every ci task, not only the required ones?",
		},
	],
	skipOptions: RUN_SKIP_OPTIONS,
	supportsDryRun: true,
};
