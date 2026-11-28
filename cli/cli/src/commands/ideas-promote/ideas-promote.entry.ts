import { type MenuEntry } from "@theholocron/kyber/menu";

export const ideasPromoteEntry: MenuEntry = {
	name: "new spec",
	description: "Write a draft spec in .notes/ from the issue an idea was filed as",
	positionals: [{ key: "issue", message: "Issue (#1234 or a Linear key):", type: "input" }],
	skipOptions: ["name", "yes"],
	supportsDryRun: true,
};
