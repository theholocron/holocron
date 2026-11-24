import { type MenuEntry } from "@theholocron/kyber/menu";

export const newIncidentEntry: MenuEntry = {
	name: "new incident",
	description: "Open an incident on a status page, with its first update and the components it marks",
	positionals: [{ key: "title", message: "Incident title:", type: "input" }],
	options: [
		{ key: "message", flag: "--message", type: "input", message: "What the first update says:" },
		{ key: "component", flag: "--component", type: "input", message: "Component to mark (<name>=<impact>):" },
	],
	skipOptions: ["page", "status", "allow-duplicate", "notify", "yes"],
	supportsDryRun: true,
};
