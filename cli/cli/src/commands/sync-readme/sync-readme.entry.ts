import { type MenuEntry } from "@theholocron/kyber/menu";

export const syncReadmeEntry: MenuEntry = {
	name: "sync readme",
	description: "Sync the Installation + Usage block in README.md from package.json",
	positionals: [],
	// `sync readme` declares its own `--dry-run`; the menu already previews with the global one (`supportsDryRun`).
	skipOptions: ["dry-run"],
	supportsDryRun: true,
};
