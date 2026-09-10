import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { nodeDocs } from "@theholocron/holocron-config";

// nodeDocs() provides: org, domain, docs, strict repo protection, the standard
// Node.js task set (lint/test/typecheck marked `required`, security, review,
// stale, greetings, dependencies, bookkeeping, deploy), the base providers
// (source, ci, issues, deployment, dns, workers), and `extraRequiredChecks`
// (codecov/patch, codecov/project, "audit / Conclusion").
const { repo, tasks: presetTasks, providers, org, domain, docs, extraRequiredChecks: presetChecks } = nodeDocs();

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
	// Required status checks not backed by a `{ required: true }` task.
	// `holocron setup` appends these to the task-derived contexts from
	// `astromech.requiredChecks()`. The preset supplies codecov/patch,
	// codecov/project and "audit / Conclusion"; the rest are repo-specific.
	extraRequiredChecks: [
		...presetChecks,
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
	// The preset's task set (lint + the org linter set, test, typecheck — all
	// `{ required: true }` — plus security / review / stale / greetings /
	// dependencies / bookkeeping / deploy). The repo-specific tasks (audit,
	// release, sync, wiki) and `syncScripts: false` live in `astromech.config.ts`
	// and are merged in by astromech's `loadTasksConfig`.
	tasks: [...presetTasks],
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
