import { type MenuEntry } from "@theholocron/kyber/menu";

export const notificationsSetupEntry: MenuEntry = {
	name: "setup notifications",
	description: "Apply the server layout a notifications provider declares in holocron.config.ts",
	positionals: [],
	supportsDryRun: true,
};
