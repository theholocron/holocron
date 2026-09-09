import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { nodeDocs } from "@theholocron/holocron-config";

// nodeDocs() provides: org, domain, docs, strict repo protection, the standard
// Node.js task set (lint, test, security, review, stale, greetings,
// dependencies, bookkeeping, typecheck, deploy), and base providers (source,
// ci, issues, deployment, dns, workers).
const { repo, tasks: presetTasks, providers, org, domain, docs } = nodeDocs();

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
	},
	// Required status checks not backed by a task. `holocron setup` appends these
	// to the `{ required: true }` task contexts from `astro.requiredChecks()`.
	extraRequiredChecks: [
		// TEMP: inline until @theholocron/holocron-config >= 8.2.0 ships these via
		// the preset's extraRequiredChecks (Phase 5 R2 restores `...preset` reliance).
		"Lint / Conclusion",
		"Test / Conclusion",
		"Typecheck / Conclusion",
		"audit / Conclusion",
		"codecov/patch",
		"codecov/project",
		// genuinely repo-specific — stays after R2:
		"tsdown (every workspace)",
		"codecov/patch/astromech",
		"codecov/patch/cli",
		"codecov/patch/datapad",
		"codecov/patch/holocron-plugin-1password",
		"codecov/patch/holocron-plugin-axiom",
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
	tasks: [
		...presetTasks.filter((t) => !["lint", "test", "typecheck"].includes(typeof t === "string" ? t : t.name)),
		// TEMP: mark the gating tasks `required` inline — @theholocron/holocron-config
		// >= 8.2.0 carries `required: true` on these (Phase 5 R2).
		{
			name: "lint",
			required: true,
			linters: [
				"eslint",
				"prettier",
				"yamllint",
				"actionlint",
				"gitleaks",
				"editorconfig",
				"commitlint",
				"git-merge-conflict-markers",
			],
		},
		{ name: "test", required: true },
		{ name: "typecheck", required: true },
		// Audit: Knip dead-code analysis on top of the standard bundle audit; gates merges
		{ name: "audit", required: true, with: { "run-knip": true } },
		// Release: tag Sentry releases for the CLI package
		{ name: "release", with: { "sentry-project": "holocron-cli" } },
		// Sync: keep generated files (workflows, labels, etc.) current on push to main
		"sync",
		// Wiki: publish engineering docs to wiki.theholocron.dev/holocron
		"wiki",
	],
	// Source repo opts out of `holocron sync`'s package.json script writes: its
	// root scripts (`build`, `test`, …) must stay bootstrap-safe raw commands
	// because `holocron` here IS the local build artifact (`node
	// packages/cli/dist/cli.mjs`), not an installed bin. Consumer repos let
	// sync manage the `holocron` entry + `holocron run <task>` wrappers.
	syncScripts: false,
	providers: {
		...providers,
		secrets: "github",
		// Environments: manage GitHub deployment environments for staging/production
		environments: "github",
		// Errors: Sentry — `holocron setup` provisions the project and pushes the
		// DSN to repo secrets. Runtime error reporting (telemetry.ts) is independent
		// and always on via the built-in DSN; this entry is for the setup surface.
		errors: ["sentry", { org: "theholocron" }],
		// Logs: Axiom aggregation — setup provisions the holocron-ci / holocron-local datasets
		logs: "axiom",
		// Wiki: Fern publishes the engineering wiki at wiki.theholocron.dev/holocron
		wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron", icon: "fa-duotone fa-gear" }],
	},
	// Logs: ship local runs to the shared holocron-local Axiom dataset. Needs an
	// Axiom token in the keyring (`holocron auth set axiom.theholocron <TOKEN>`)
	// or HOLOCRON_AXIOM_TOKEN. CI overrides the dataset to holocron-ci via the
	// HOLOCRON_AXIOM_DATASET variable (env wins over config).
	log: { axiom: { dataset: "holocron-local" } },
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
} satisfies HolocronConfig);
