import { fileURLToPath } from "node:url";

import { codecovUploads as generateCodecovUploads, readWorkspacePackages } from "@theholocron/astromech";
import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { docsPreset } from "@theholocron/cli/presets";

import orgArea from "./.holocron/org.js";

// docsPreset() provides: org, docs, strict repo protection, the base
// providers (source, ci, issues, deployment, dns, workers). Its `tasks` speak the
// flat ids (`lint:code`, `test:unit`, ...), but this repo declares its own tasks
// directly below, with repo-specific `with:` inputs, instead of spreading them.
// Its `domain` is not taken: the org's zone is spelled once, in `.holocron/org.ts`, and the loader sets `domain` on
// this config from it (an inline `domain` here would be an error). The hostnames built below import it from there,
// which is safe for Sentinel's remote loader because it writes the whole `.holocron/` tree beside this file.
const { repo, providers, org, docs } = docsPreset();
const { domain } = orgArea;

// One Codecov upload per workspace package, so a PR that changes one package uploads only the packages whose tests
// ran and Codecov carries every other package's flag forward (a flag is carried whole or not at all, so a flag per
// group folder would drop a group's untouched packages). The flags are the package slugs listed under
// `flag_management` in codecov.yml; both come from the workspace (`holocron sync`). Packages write lcov.info to
// `<location>/coverage/`, except `skills`, which runs node's test runner and writes it next to its package.json.
const codecovUploads = generateCodecovUploads(readWorkspacePackages(fileURLToPath(new URL(".", import.meta.url))), {
	skills: "skills/lcov.info",
});

export default defineConfig({
	description:
		"A pluggable, capability-based CLI for spinning up and operating software projects — your own infrastructure-as-tool.",
	homepage: `https://docs.${domain}/holocron/`,
	org,
	docs,
	// `doctor dns` watches the iCloud Mail records on the apex (#1569). `sharedVariables` (#2041) are held twice on purpose: a local and a CI copy of a token; rotate both.
	doctor: {
		mail: "icloud",
		sharedVariables: [
			"HOLOCRON_ADMIN_TOKEN",
			"HOLOCRON_AXIOM_ORG",
			"HOLOCRON_AXIOM_TOKEN",
			"HOLOCRON_CLOUDFLARE_TOKEN",
			"HOLOCRON_DEPLOY_TOKEN",
			"HOLOCRON_DISCORD_BOT_TOKEN",
			"HOLOCRON_ENVIRONMENT",
			"HOLOCRON_FERN_TOKEN",
			"HOLOCRON_ISSUES_TOKEN",
			"HOLOCRON_ORG_TOKEN",
			"HOLOCRON_READ_TOKEN",
			"HOLOCRON_RELEASE_TOKEN",
			"HOLOCRON_SECRETS_TOKEN",
			"HOLOCRON_SYNC_TOKEN",
			"HOLOCRON_USER_SYNC_TOKEN",
			"SENTINEL_AXIOM_DATASET",
			"SENTINEL_AXIOM_INGEST_TOKEN",
			"SENTINEL_GITHUB_APP_ID",
			"SENTINEL_GITHUB_APP_PRIVATE_KEY",
			"SENTINEL_OP_SERVICE_ACCOUNT_TOKEN",
		],
	},
	repo: {
		...repo,
		// GitHub's default branch was still main while all v2 alpha work lands
		// on alpha (CLAUDE.md's Releases section) -- Sentinel's validateConfig()
		// only ever reads a repo's default branch (D6, a security boundary),
		// so it's been silently validating main's stale pre-#675-vocabulary
		// holocron.config.ts instead of what's actually being developed.
		// Revert to "main" (or drop this field) once alpha merges to main for
		// the v2.0.0 stable cut and stops being the active branch.
		defaultBranch: "alpha",
		// teams, topics, variables and secrets live in .holocron/repo.ts; the loader adds them to `repo` here.
	},
	// Required status checks not backed by a `{ required: true }` task.
	// `holocron setup` appends these to the task-derived contexts from
	// `astromech.requiredChecks()`. Only the aggregate codecov gates belong
	// here: a ruleset takes no wildcards and a package a PR does not touch posts
	// no status, so a per-package `codecov/patch/<slug>` can neither be listed
	// for every package (one per workspace, hundreds once the org's repos are
	// folded in) nor be relied on to appear. Codecov still posts the
	// per-component statuses; they are informational, not required (#1223).
	// "validate:deps / ..." and "validate:generated / ..." are the checks of the `validate:deps` (`holocron probe deps
	// check`, #1380) and `validate:generated` (`holocron probe generated check`, #1405) tasks. They are listed here, not
	// `required: true`, so the aggregate waits on them without the tasks joining `holocron run ci`.
	// "codecov/patch/documentation" is the doc-comment gate (#1368): the `documentation` flag's patch status, which
	// fails a PR that adds or changes an exported symbol without a comment. Its project status is not required.
	extraRequiredChecks: [
		"codecov/patch",
		"codecov/project",
		"codecov/patch/documentation",
		"validate:deps / Check dependency catalogs",
		"validate:generated / Check generated files",
	],
	// Doc-comment coverage of the public API (#1368): the `documentation` Codecov flag fails a PR that adds or
	// changes an export without a comment, and posts its statuses without marking them informational. `codecov/patch/documentation` is a required check (`extraRequiredChecks` above); the value
	// itself never touches the ruleset.
	repoValidation: { docsCoverage: "required" },
	// The decomposed intent vocabulary (epic #672, D3/#675) — what used to be
	// `docsPreset()`'s bundled `lint` (8 linters) is now 5 separately-gated
	// tasks; `typecheck`/`test`/`deploy` are renamed 1:1. `security`/`review`/
	// `stale`/`greetings`/`dependencies`/`bookkeeping` aren't part of the
	// task-name vocabulary (workflow-only keys, unaffected by the rename).
	// The repo-specific tasks (the decomposed audit tasks, platform.
	// repoValidation, release, sync-repo, publish-wiki)
	// and `syncScripts: false` live in `astromech.config.ts` and are merged
	// in by astromech's `loadTasksConfig`.
	tasks: [
		{
			name: "lint:code",
			required: true,
			// Packages with no eslint.config of their own lint with the root one, which loads the workspace's
			// eslint-config from dist: build it first, even for a package that does not list it as a dependency.
			turbo: { dependsOn: ["@theholocron/eslint-config#build"] },
		},
		{ name: "lint:editorconfig", required: true },
		{ name: "lint:markdown", required: true },
		{ name: "format", required: true },
		{ name: "lint:data", required: true },
		{ name: "scan:secrets", required: true },
		{ name: "lint:commits", required: true },
		{ name: "test:unit", required: true, with: { affected: true, uploads: codecovUploads } },
		"scan:code",
		"annotate",
		"mark-stale",
		"greet",
		"update-deps",
		"label",
		"reconcile-projects",
		"remind-doctor",
		"measure:docs",
		"validate:deps",
		"validate:generated",
		{ name: "typecheck", required: true, with: { affected: true } },
		// deploy-docs implies docs: true — this repo has no Storybook, so
		// the dedicated task is more idiomatic than deploy + with:
		// { docs: true } now that the two mean the same thing (astromech.ts).
		{ name: "deploy-docs", with: { preview: true } },
	],
	providers: {
		...providers,
		secrets: "github",
		// Credentials: tokens come from the 1Password Environment `<org/repo> - <layer>`, derived from the git remote
		// and the layer (#2063, see docs: tokens), ahead of the keyring (#1606). A token in the process environment or a repo-root `.env` still wins.
		credentials: ["1password"],
		// Vault: the source `holocron sync secrets` reads. Sentinel and Comlink name their own layer (`prod`) in their
		// configs; this one is for the GitHub Actions secrets, so it is the `ci` layer, `<org/repo> - ci` (#2069).
		// `holocron sync secrets --env ci` reads it (`repo.secrets.sync` says where each key goes).
		vault: ["1password", { layer: "ci" }],
		// Environments: manage GitHub deployment environments for staging/production
		environments: "github",
		// Errors: Sentry — `holocron setup` provisions the project and pushes the
		// DSN to repo secrets. Runtime error reporting (observability/telemetry.ts) is independent
		// and always on via the built-in DSN; this entry is for the setup surface.
		errors: "sentry",
		// Monitoring: Checkly. Only the alert channel is managed from here (the uptime channel's feed below); the checks
		// themselves are declared next to the service they watch, in apps/sentinel/holocron.config.ts. The account id
		// comes from .holocron/org.ts.
		monitoring: "checkly",
		// Logs: Axiom aggregation — setup provisions the CLI's dataset (HOLOCRON_AXIOM_DATASET, `holocron`); every environment ships to it, split by the `env` tag
		logs: "axiom",
		// Projects: the org's planning board (GitHub Projects), declared as template -> name (SPEC-0020, #1744). The
		// template is a built-in (roadmap) or a file in .holocron/projects; the board is found by name among the open
		// ones. `holocron setup project` brings it in line, `doctor project` checks it, and the hourly
		// `reconcile-projects` task (see `tasks`) keeps statuses true to the blocked-by links.
		projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }],
		// Ideas: the Obsidian vault "The Holocron" in iCloud Drive, the inbox in front of the issue (SPEC-0072, #1994).
		// `holocron sync ideas` files the notes whose status is `in-progress` as issues. A machine whose vault is
		// elsewhere sets HOLOCRON_IDEAS_DIR, which wins.
		ideas: ["obsidian", { vault: "The Holocron" }],
		// Notifications: the Holocron Discord server. `holocron setup notifications`
		// applies the layout below (idempotent; --dry-run previews it). This block
		// lives in ONE repo on purpose -- a server layout is org-level, so it must
		// not sit in a shared preset that every repo would then apply. Each webhook
		// URL is stored straight into the org secret HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>
		// (never printed). Needs HOLOCRON_DISCORD_BOT_TOKEN (the Holonet bot).
		notifications: [
			"discord",
			{
				guildId: "1303969001822486568",
				// The server layout lives in .holocron/notifications.ts; the loader sets it as `layout` here.
			},
		],
		// Wiki: Fern publishes the engineering wiki at wiki.theholocron.dev/holocron
		wiki: ["fern", { domain: `wiki.${domain}`, fernOrg: "holocron", icon: "fa-duotone fa-gear" }],
	},
	// Registered GitHub Apps: `holocron doctor github-app` compares each with its manifest (GitHub cannot change an
	// existing App's permissions or events, so each instance is changed by hand). The id and key come from the
	// 1Password Environment of the layer: `prod` for Sentinel, `dev` for the development instance (#2069).
	githubApps: [
		{ name: "Sentinel", manifest: "apps/sentinel/github-app.manifest.json", layer: "prod" },
		{ name: "Sentinel - dev", manifest: "apps/sentinel/github-app.manifest.json", layer: "dev" },
	],
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
} satisfies HolocronConfig);
