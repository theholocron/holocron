import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const notificationsSetupEntry: CommandEntry = {
	name: "notifications setup",
	description: "Apply the server layout a notifications provider declares in holocron.config.ts",
	positionals: [],
	supportsDryRun: true,
};
