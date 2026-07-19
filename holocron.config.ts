import { defineConfig } from "@theholocron/cli";
import type { HolocronConfig } from "@theholocron/cli";
import { theholocronNode } from "@theholocron/holocron-config";

const defaults = theholocronNode();
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
		workflows: defaults.workflows,
	},
	providers: {
		...defaults.providers,
		vault: ["doppler", { project: "holocron", config: "dev" }],
		secrets: "github",
		environments: "github",
	},
} satisfies HolocronConfig);
