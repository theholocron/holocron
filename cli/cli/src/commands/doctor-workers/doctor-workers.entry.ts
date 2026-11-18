import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorWorkersEntry: MenuEntry = {
	name: "doctor workers",
	description:
		"Check the declared Workers and deployment projects: they exist, route and deploy healthily (read-only)",
	positionals: [],
	skipOptions: ["all", "repo"],
	supportsDryRun: false,
};
