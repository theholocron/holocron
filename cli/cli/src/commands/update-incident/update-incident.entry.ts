import { type MenuEntry } from "@theholocron/kyber/menu";

export const updateIncidentEntry: MenuEntry = {
	name: "update incident",
	description: "Append an update to a status page incident",
	positionals: [{ key: "id", message: "Incident id:", type: "input" }],
	options: [
		{
			key: "status",
			flag: "--status",
			type: "select",
			choices: ["investigating", "identified", "monitoring"],
			message: "Status:",
			required: true,
		},
		{ key: "message", flag: "--message", type: "input", message: "What the update says:", required: true },
	],
	skipOptions: ["page", "notify", "yes"],
	supportsDryRun: true,
};
