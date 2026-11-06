import { type MenuEntry } from "@theholocron/kyber/menu";

export const pluginCreateEntry: MenuEntry = {
	name: "new plugin",
	description: "Scaffold a new @theholocron/holocron-plugin-<slug> package",
	positionals: [
		{ key: "slug", message: "Package slug (kebab-case):", type: "input" },
		{ key: "vendor", message: "Vendor display name (PascalCase):", type: "input" },
	],
	supportsDryRun: true,
};
