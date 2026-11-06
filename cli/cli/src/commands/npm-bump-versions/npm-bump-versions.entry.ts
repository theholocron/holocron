import { type MenuEntry } from "@theholocron/kyber/menu";

export const npmBumpVersionsEntry: MenuEntry = {
	name: "package bump-versions",
	description: "Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
	positionals: [{ key: "newVersion", cliArg: "new-version", message: "New version:", type: "input" }],
	supportsDryRun: true,
};
