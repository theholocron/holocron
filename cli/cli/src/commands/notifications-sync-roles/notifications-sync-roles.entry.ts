import { type MenuEntry } from "@theholocron/kyber/menu";

export const notificationsSyncRolesEntry: MenuEntry = {
	name: "notifications sync-roles",
	description: "Make who holds a server role match a team, through the links file",
	positionals: [],
	options: [
		{
			key: "provider",
			flag: "--provider",
			type: "input",
			message: "Which notifications provider (blank = the only one that can manage roles):",
		},
		{
			key: "keep",
			flag: "--keep",
			type: "confirm",
			default: false,
			message: "Keep the role on linked people who left the team (only add, never remove)?",
		},
	],
	supportsDryRun: true,
};
