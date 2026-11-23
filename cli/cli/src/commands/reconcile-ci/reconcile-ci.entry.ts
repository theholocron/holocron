import { type MenuEntry } from "@theholocron/kyber/menu";

export const reconcileCiEntry: MenuEntry = {
	name: "reconcile ci",
	description:
		"Make the ci / Required checks check say what the checks on each open pull request call for (the manual path and the sweep)",
	positionals: [{ key: "pullRequest", message: "Pull request number (empty for every open one):", type: "input" }],
	options: [],
	skipOptions: ["max-age"],
	supportsDryRun: true,
};
