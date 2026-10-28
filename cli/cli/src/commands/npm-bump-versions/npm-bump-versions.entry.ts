import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const npmBumpVersionsEntry: CommandEntry = {
	name: "package bump-versions",
	description: "Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
	positionals: [{ key: "newVersion", cliArg: "new-version", message: "New version:", type: "input" }],
	supportsDryRun: true,
};
