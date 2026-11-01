import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const moveTagEntry: CommandEntry = {
	name: "package move-tag",
	description: "Move a version group's major tag (ci-v1) to its latest stable release (semantic-release publishCmd)",
	positionals: [{ key: "group", cliArg: "group", message: "Version group:", type: "input" }],
	supportsDryRun: true,
};
