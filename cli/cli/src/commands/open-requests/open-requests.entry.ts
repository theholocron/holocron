import { type MenuEntry } from "@theholocron/kyber/menu";

export const openRequestsEntry: MenuEntry = {
	name: "open requests",
	description: "Open the request tool's workspace with its secrets filled in from the layer's vault Environment",
	positionals: [],
	skipOptions: ["yes", "to", "environment"],
	supportsDryRun: true,
};
