import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const newRepoEntry: CommandEntry = {
	name: "new repo",
	description: "Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
	positionals: [],
	supportsDryRun: true,
};
