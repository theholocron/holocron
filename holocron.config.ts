import { defineConfig } from "@theholocron/cli";
import { node } from "@theholocron/holocron-config";

const { repo, workflows, providers } = node();
export default defineConfig({
	name: "holocron",
	description:
		"The Holocron CLI — pluggable, capability-based infrastructure orchestrator. This file makes the repo self-hosted: holocron commands work inside it.",
	repo: {
		name: "theholocron/holocron",
		topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
		...repo,
	},
	workflows,
	providers: {
		...providers,
		vault: ["doppler", { project: "holocron", config: "dev" }],
		secrets: "github",
		environments: "github",
	},
});
