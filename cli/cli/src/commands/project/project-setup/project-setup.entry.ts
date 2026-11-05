import { type CommandEntry } from "../../../interactive-menu/command-registry/command-registry.type.js";

export const projectSetupEntry: CommandEntry = {
	name: "project setup",
	description: "Make each board providers.projects declares match its template, creating the ones that are missing",
	positionals: [],
	supportsDryRun: true,
};
