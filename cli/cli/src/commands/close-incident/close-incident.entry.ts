import { type MenuEntry } from "@theholocron/kyber/menu";

export const closeIncidentEntry: MenuEntry = {
	name: "close incident",
	description: "Resolve a status page incident with a final update",
	positionals: [{ key: "id", message: "Incident id:", type: "input" }],
	options: [{ key: "message", flag: "--message", type: "input", message: "What the final update says:" }],
	skipOptions: ["page", "notify", "yes"],
	supportsDryRun: true,
};
