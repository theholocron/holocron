import { type MenuEntry } from "@theholocron/kyber/menu";

export const moveTagEntry: MenuEntry = {
	name: "publish tag",
	description: "Move a version group's major tag (ci-v1) to its latest stable release (semantic-release publishCmd)",
	positionals: [{ key: "group", cliArg: "group", message: "Version group:", type: "input" }],
	supportsDryRun: true,
};
