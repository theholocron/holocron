import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	description:
		"A pluggable, capability-based CLI for spinning up and operating software projects — your own infrastructure-as-tool.",
	homepage: "https://docs.theholocron.dev/holocron/",
	org: "theholocron",
	domain: "theholocron.dev",
	docs: {
		build: "workflow", // default (nodeDocs preset)
		https: true, // default (nodeDocs preset)
	},
	repo: {
		protection: "strict", // default (node preset)
		properties: {
			lifecycle: "active", // default (node preset)
			open_source: true, // default (node preset)
			runtime_environment: "node", // default (node preset)
			uses_external_packages: true, // default (node preset — monorepo workspaces)
		},
		teams: [{ slug: "gatekeepers", permission: "maintain" }],
		topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
		requiredChecks: [
			"Lint / Conclusion", // from lint workflow (node preset)
			"Test / Conclusion", // from test workflow (node preset)
			"Typecheck / Conclusion", // from typecheck workflow (nodeDocs preset)
			"codecov/patch", // from docs preset
			"codecov/project", // from docs preset
			"audit / Conclusion", // from nodeDocs preset
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
		{ name: "lint", with: { "enable-auto-commit": true } }, // default: true (injected by CLI)
		{ name: "test", with: { "run-unit": true } }, // default: true (reusable default)
		"codeql",
		"review",
		{
			name: "stale",
			with: {
				"days-before-stale": 30, // default (reusable default)
				"days-before-close": 5, // default (reusable default)
			},
		},
		"greetings",
		"dependencies",
		"bookkeeping",
		"typecheck",
		{
			name: "deploy",
			with: {
				docs: true, // deploy type: docs (standard layout)
				preview: true, // derive Cloudflare Pages project from org context
			},
		},
		{ name: "audit", with: { "run-knip": true } },
		{ name: "release", with: { "sentry-project": "holocron-cli" } },
		"sync",
		"wiki",
	],
	providers: {
		source: "github", // default (node preset)
		ci: "github", // default (node preset)
		issues: [
			"github",
			{
				labels: {
					inProgress: "status:in-progress", // default (node preset)
					inReview: "status:in-review", // default (node preset)
				},
			},
		],
		deployment: ["cloudflare", { accountId: "9c558af98664d13fc89b7e0a0d93d5a8" }], // default (docs preset)
		dns: "cloudflare", // default (docs preset)
		workers: ["cloudflare", { accountId: "9c558af98664d13fc89b7e0a0d93d5a8" }], // default (docs preset)
		vault: ["doppler", { project: "holocron", config: "dev" }],
		secrets: "github",
		environments: "github",
		wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron", icon: "fa-duotone fa-gear" }],
	},
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
} satisfies HolocronConfig);
