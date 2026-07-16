import { defineConfig } from "@theholocron/cli";
import type { HolocronConfig } from "@theholocron/cli";

export default defineConfig({
	project: {
		name: "holocron",
		description:
			"The Holocron CLI — pluggable, capability-based infrastructure orchestrator. This file makes the repo self-hosted: holocron commands work inside it.",
		repo: {
			name: "theholocron/holocron",
			protection: "strict",
			topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
			properties: {
				lifecycle: "active",
				open_source: true,
				runtime_environment: "node",
				uses_external_packages: true,
			},
		},
		workflows: [
			"lint",
			"test",
			"typecheck",
			"codeql",
			"review",
			"stale",
			"greetings",
			"dependencies",
			"bookkeeping-pr",
		],
	},
	providers: {
		vault: ["doppler", { project: "holocron", config: "dev" }],
		source: "github",
		ci: "github",
		secrets: "github",
		environments: "github",
		issues: ["github", { labels: { inProgress: "status:in-progress", inReview: "status:in-review" } }],
	},
} satisfies HolocronConfig);
