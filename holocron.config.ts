import { defineConfig } from "@theholocron/cli";
import { nodeDocs } from "@theholocron/holocron-config";

const { repo, workflows, providers, org, domain, docs } = nodeDocs();
export default defineConfig({
	description:
		"A pluggable, capability-based CLI for spinning up and operating software projects — your own infrastructure-as-tool.",
	homepage: "https://docs.theholocron.dev/holocron/",
	org,
	domain,
	docs,
	repo: {
		teams: [{ slug: "gatekeepers", permission: "maintain" }],
		topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
		...repo,
		requiredChecks: [
			...repo.requiredChecks,
			"tsdown (every workspace)",
			"codecov/patch/cli",
			"codecov/patch/holocron-plugin-1password",
			"codecov/patch/holocron-plugin-clerk",
			"codecov/patch/holocron-plugin-cloudflare",
			"codecov/patch/holocron-plugin-fern",
			"codecov/patch/holocron-plugin-discord",
			"codecov/patch/holocron-plugin-doppler",
			"codecov/patch/holocron-plugin-github",
			"codecov/patch/holocron-plugin-infisical",
			"codecov/patch/holocron-plugin-neon",
			"codecov/patch/holocron-plugin-posthog",
			"codecov/patch/holocron-plugin-postman",
			"codecov/patch/holocron-plugin-sentry",
			"codecov/patch/holocron-plugin-slack",
			"codecov/patch/holocron-plugin-vercel",
		],
	},
	workflows: [
		...workflows,
		{ name: "audit", with: { "run-knip": true } },
		{ name: "release", with: { "sentry-project": "holocron-cli" } },
		"sync",
		"wiki",
	],
	providers: {
		...providers,
		vault: ["doppler", { project: "holocron", config: "dev" }],
		secrets: "github",
		environments: "github",
		wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron" }],
	},
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
});
