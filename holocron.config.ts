import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { nodeDocs } from "@theholocron/holocron-config";

// nodeDocs() provides: org, domain, docs, strict repo protection, standard
// Node.js workflows (lint, test, codeql, review, stale, greetings, dependencies,
// bookkeeping, typecheck, deploy), and base providers (source, ci, issues,
// deployment, dns, workers).
const { repo, workflows, providers, org, domain, docs } = nodeDocs();

export default defineConfig({
	description:
		"A pluggable, capability-based CLI for spinning up and operating software projects — your own infrastructure-as-tool.",
	homepage: "https://docs.theholocron.dev/holocron/",
	org,
	domain,
	docs,
	repo: {
		...repo,
		teams: [{ slug: "gatekeepers", permission: "maintain" }],
		topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
		requiredChecks: [
			...repo.requiredChecks,
			// tsdown build check — every workspace package must compile
			"tsdown (every workspace)",
			// per-package Codecov coverage gates
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
		// Audit: enable Knip dead-code analysis on top of the standard bundle audit
		{ name: "audit", with: { "run-knip": true } },
		// Release: tag Sentry releases for the CLI package
		{ name: "release", with: { "sentry-project": "holocron-cli" } },
		// Sync: keep generated files (workflows, labels, etc.) current on push to main
		"sync",
		// Wiki: publish engineering docs to wiki.theholocron.dev/holocron
		"wiki",
	],
	providers: {
		...providers,
		// Vault: Doppler holds all project secrets (tokens, keys, credentials)
		vault: ["doppler", { project: "holocron", config: "dev" }],
		// Secrets: sync vault secrets to GitHub Actions secrets via holocron setup
		secrets: "github",
		// Environments: manage GitHub deployment environments for staging/production
		environments: "github",
		// Wiki: Fern publishes the engineering wiki at wiki.theholocron.dev/holocron
		wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron", icon: "fa-duotone fa-gear" }],
	},
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
} satisfies HolocronConfig);
