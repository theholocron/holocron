import { type MenuEntry } from "@theholocron/kyber/menu";

export const newRepoEntry: MenuEntry = {
	name: "new repo",
	description: "Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
	positionals: [],
	skipOptions: [
		"description",
		"homepage",
		"vault",
		"deployment",
		"agent",
		"runtime-environment",
		"topics",
		"protection",
		"open-source",
		"uses-external-packages",
		"skills",
		"is-template",
		"verify",
		// `new repo` declares its own `--org` (the organization to create in); the command asks for it on a terminal.
		"org",
	],
	supportsDryRun: true,
};
