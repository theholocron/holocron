import { defineConfig } from "@theholocron/astromech/config";

/**
 * The task-runner layer for this repo.
 *
 * Split out from `holocron.config.ts` to dogfood the two-file config system
 * (ADR-0009): `holocron.config.ts` carries the intent-vocabulary tasks
 * (sourceQuality, security, verification, deploy-docs — see D13 there
 * for why they're hand-declared instead of spread from the `nodeDocs()`
 * preset), this file adds the repo-specific ones. astromech's
 * `loadTasksConfig` merges them — task arrays concatenate, this file wins
 * on scalars — and `holocron run` / `holocron run ci` / `holocron repo setup` /
 * `holocron repo sync` all read the merged manifest.
 */
export default defineConfig({
	tasks: [
		// Build: sanity check that every workspace compiles to dist/. Used to be
		// a hand-maintained .github/workflows/build.yml — now the same templated
		// task every repo can opt into (astromech#build).
		// SENTRY_AUTH_TOKEN passthrough: cli/cli builds with sourcemaps
		// (tsdown.config.ts) that get associated with Sentry releases — the
		// token needs to be part of turbo's cache key, or a token rotation
		// wouldn't invalidate a stale cached build.
		{
			name: "build",
			required: true,
			with: { affected: true },
			turbo: { passThroughEnv: ["SENTRY_AUTH_TOKEN"] },
		},
		// Audit, decomposed (epic #672, D3/#675 — the old single `audit` task's
		// 3 jobs are now separate tasks). This repo has no lighthouse config,
		// so test:perf isn't included (matches the old
		// `run-performance` never being enabled here).
		{ name: "lint:unused", required: true },
		{ name: "measure-bundle", required: true },
		// Repo/spec validation (`holocron probe specs check`, `holocron probe docs presence`) —
		// used to ride inside the old `lint` job with no linter connection at
		// all; now its own task (#675).
		{ name: "validate:specs", required: true },
		{ name: "validate:docs", required: true },
		// Publish: tag Sentry releases for the CLI package, and run the
		// post-release `deploy` job for packages whose `deploy` task is
		// `on: release` (Sentinel, #928, #930).
		{
			name: "release",
			with: {
				// Folders that release on their own version line (tags `<group>-v<version>`), one at a
				// time, before the repo-wide release (which depends on them and leaves them out). List them in
				// dependency order: clients depends on utils and observability, so it goes after both.
				// `ci` publishes nothing to npm: it only records a release, tags it (`ci-v1.4.0`) and moves
				// `ci-v1` (see release.config.ts), so it has nothing to build and no dependency on the rest.
				groups: [
					"utils",
					"observability",
					"skills",
					"configs",
					"themes",
					"clients",
					{ name: "ci", "run-build": false },
				],
				// Everything in no group is released together, as before. The Sentry release and the
				// post-release deploy belong to it alone, not to every group.
				ungrouped: { "sentry-project": "holocron-cli", "deploy-on-release": true },
			},
		},
		// Sync: keep generated files (workflows, labels, …) current on push to main.
		"sync-repo",
		// Notify Check: manual end-to-end test of the notification channels (posts a
		// labelled message to each). Needs the reusable workflow on theholocron/.github main.
		"check-notify",
		// Sync Templates: when astromech's own templates change on alpha or main, open a pull request with the
		// generated reusable workflows + composite actions in theholocron/.github and in each repo that has a
		// holocron.config (holocron#1012/#1013/#1014). Holocron-repo-specific — no other repo owns these templates.
		"sync-templates",
		// Token Expiry: `holocron doctor tokens` daily, so a token that is rejected or has 7 days or fewer
		// left fails a run and GitHub's failed-workflow notification reaches the team.
		"check-tokens",
		// Wiki: publish the engineering wiki to wiki.theholocron.dev/holocron.
		"publish-wiki",
		// Spec discussions: a forum post in #ideas for every ADR and spec, hourly and on a push to alpha, and for the
		// files of an open pull request.
		"sync-specs",
		"preview-specs",
		// Sentinel: the manual and stable-channel deploy; alpha releases deploy it from the release job.
		"deploy-sentinel",
		// Sentinel: its secrets from 1Password to Vercel and the org, by hand when one rotates.
		"sync-secrets",
	],
	// `holocron` here IS the local build artifact (`node cli/cli/dist/cli.mjs`), not an installed bin, so the synced
	// `holocron` script runs that. The other root scripts need no CLI: in a workspace `scriptsFor` writes them as
	// `turbo run <task>` (or the tool's own command), which is why the sync is on (spec ci-flat-task-vocabulary).
	holocronScript: "node cli/cli/dist/cli.mjs",
});
