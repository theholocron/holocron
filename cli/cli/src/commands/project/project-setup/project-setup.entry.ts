import { type MenuEntry } from "@theholocron/kyber/menu";

export const projectSetupEntry: MenuEntry = {
	name: "project setup",
	description: "Make each board providers.projects declares match its template, creating the ones that are missing",
	positionals: [],
	supportsDryRun: true,
};
