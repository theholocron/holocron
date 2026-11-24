import { type MenuEntry } from "@theholocron/kyber/menu";

export const updateIncidentEntry: MenuEntry = {
	name: "update incident",
	description: "Append an update to a status page incident",
	positionals: [{ key: "id", message: "Incident id:", type: "input" }],
	options: [],
	skipOptions: ["page", "status", "message", "notify", "yes"],
	supportsDryRun: true,
};
