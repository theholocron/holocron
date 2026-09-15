import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { nodeDocs } from "@theholocron/holocron-config";

// nodeDocs() provides: org, domain, docs, strict repo protection, the base
// providers (source, ci, issues, deployment, dns, workers). Per D13
// (epic #672 / .notes/tech-holocron-platform.spec.md): the preset's `tasks`
// and task-derived `extraRequiredChecks` still speak the pre-decomposition
// vocabulary (`lint`, `test`, `typecheck`, `deploy`, plain `"audit /
// Conclusion"`) — theholocron/configs hasn't caught up to #675 yet, and
// doesn't need to for this repo to move (D13: it's a convenience preset,
// not a required dependency). This repo declares its own intent-facing
// tasks directly instead of spreading `presetTasks`/`presetChecks`.
const { repo, providers, org, domain, docs } = nodeDocs();

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
	// `astromech.requiredChecks()`. codecov/patch + codecov/project are
	// project-wide gates; the rest are repo-specific. The old preset's
	// "audit / Conclusion" is gone — the decomposed audit tasks
	// (sourceQuality.deadCodeAnalysis, delivery.bundleSize, in
	// astromech.config.ts) each derive their own context automatically now
	// that they're real `{ required: true }` task entries, not a
	// preset-supplied extra.
	extraRequiredChecks: [
		"codecov/patch",
		"codecov/project",
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
	// The decomposed intent vocabulary (epic #672, D3/#675) — what used to be
	// `nodeDocs()`'s bundled `lint` (8 linters) is now 5 separately-gated
	// tasks; `typecheck`/`test`/`deploy` are renamed 1:1. `security`/`review`/
	// `stale`/`greetings`/`dependencies`/`bookkeeping` aren't part of the
	// task-name vocabulary (workflow-only keys, unaffected by the rename).
	// The repo-specific tasks (the decomposed audit tasks, platform.
	// repoValidation, delivery.publish, platform.repoSync, knowledge.wiki)
	// and `syncScripts: false` live in `astromech.config.ts` and are merged
	// in by astromech's `loadTasksConfig`.
	tasks: [
		{ name: "sourceQuality.staticAnalysis", required: true },
		{ name: "sourceQuality.formatting", required: true },
		{ name: "sourceQuality.structuredDataValidation", required: true },
		{ name: "security.secretDetection", required: true },
		{ name: "platform.commitStandards", required: true },
		{ name: "verification.unitTests", required: true },
		"security.codeScanning",
		"review",
		"stale",
		"greetings",
		"dependencies",
		"bookkeeping",
		{ name: "verification.typeSafety", required: true },
		// knowledge.docs implies docs: true — this repo has no Storybook, so
		// the dedicated task is more idiomatic than delivery.deploy + with:
		// { docs: true } now that the two mean the same thing (astromech.ts).
		{ name: "knowledge.docs", with: { preview: true } },
	],
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
