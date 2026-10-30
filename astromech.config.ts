import { defineConfig } from "@theholocron/astromech/config";

/**
 * The task-runner layer for this repo.
 *
 * Split out from `holocron.config.ts` to dogfood the two-file config system
 * (ADR-0009): `holocron.config.ts` carries the intent-vocabulary tasks
 * (sourceQuality, security, verification, knowledge.docs — see D13 there
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
		// task every repo can opt into (astromech#delivery.build).
		// SENTRY_AUTH_TOKEN passthrough: cli/cli builds with sourcemaps
		// (tsdown.config.ts) that get associated with Sentry releases — the
		// token needs to be part of turbo's cache key, or a token rotation
		// wouldn't invalidate a stale cached build.
		{
			name: "delivery.build",
			required: true,
			with: { affected: true },
			turbo: { passThroughEnv: ["SENTRY_AUTH_TOKEN"] },
		},
		// Audit, decomposed (epic #672, D3/#675 — the old single `audit` task's
		// 3 jobs are now separate tasks). This repo has no lighthouse config,
		// so verification.performance isn't included (matches the old
		// `run-performance` never being enabled here).
		{ name: "sourceQuality.deadCodeAnalysis", required: true },
		{ name: "delivery.bundleSize", required: true },
		// Repo/spec validation (validate-adrs.mjs, validate-docs-presence.mjs) —
		// used to ride inside the old `lint` job with no linter connection at
		// all; now its own task (#675).
		{ name: "platform.repoValidation", required: true },
		// Publish: tag Sentry releases for the CLI package, and run the
		// post-release `deploy` job for packages whose `delivery.deploy` task is
		// `on: release` (Sentinel, #928, #930).
		{
			name: "delivery.publish",
			with: {
				// Folders that release on their own version line (tags `<group>-v<version>`), one at a
				// time, before the repo-wide release (which depends on them and leaves them out). List them in
				// dependency order: clients depends on utils and observability, so it goes after both.
				groups: ["utils", "observability", "skills", "configs", "themes", "clients"],
				// Everything in no group is released together, as before. The Sentry release and the
				// post-release deploy belong to it alone, not to every group.
				ungrouped: { "sentry-project": "holocron-cli", "deploy-on-release": true },
			},
		},
		// Sync: keep generated files (workflows, labels, …) current on push to main.
		"platform.repoSync",
		// Notify Check: manual end-to-end test of the notification channels (posts a
		// labelled message to each). Needs the reusable workflow on theholocron/.github main.
		"platform.notifyCheck",
		// Sync Templates: push astromech's own generated reusable workflows +
		// composite actions to theholocron/.github whenever their source
		// templates change on main (holocron#1012/#1013/#1014). Holocron-
		// repo-specific — no other repo owns these templates to push.
		//
		// NOT listed here yet, deliberately: Sentinel's config-compatibility
		// check validates task names against ITS OWN deployed, bundled
		// @theholocron/astromech — never a PR's own registry.ts changes (D6,
		// the same security boundary that keeps it from running any other
		// PR-supplied code). A brand-new task name can't appear in any
		// config until a real release has shipped it and Sentinel has
		// redeployed with the updated bundle — confirmed live, this exact
		// PR failed "Platform / Compliance / Run Holocron config
		// compatibility" the first time this line was added. The generated
		// .github/workflows/platform.syncTemplates.yml (committed alongside
		// the registry entry in this same PR) runs and does its job
		// regardless — `repo sync` only ever writes files for tasks that
		// ARE listed here, it never removes one for a task that isn't, so
		// the file stays correct and functional with this line absent.
		// Add "platform.syncTemplates" back here in a follow-up PR once
		// this one has merged and released.
		// Wiki: publish the engineering wiki to wiki.theholocron.dev/holocron.
		"knowledge.wiki",
	],
	// This repo's root scripts stay bootstrap-safe raw commands — `holocron`
	// here IS the local build artifact (`node cli/cli/dist/cli.mjs`), not
	// an installed bin — so `holocron repo sync` must not rewrite package.json scripts.
	syncScripts: false,
});
