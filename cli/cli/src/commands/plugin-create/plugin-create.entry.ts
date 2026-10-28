import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";

export const pluginCreateEntry: CommandEntry = {
	name: "new plugin",
	description: "Scaffold a new @theholocron/holocron-plugin-<slug> package",
	positionals: [
		{ key: "slug", message: "Package slug (kebab-case):", type: "input" },
		{ key: "vendor", message: "Vendor display name (PascalCase):", type: "input" },
	],
	supportsDryRun: true,
};
