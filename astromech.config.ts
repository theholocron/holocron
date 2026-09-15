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
 * on scalars — and `holocron run` / `holocron ci` / `holocron setup` /
 * `holocron sync` all read the merged manifest.
 */
export default defineConfig({
	tasks: [
		// Build: sanity check that every workspace compiles to dist/. Used to be
		// a hand-maintained .github/workflows/build.yml — now the same templated
		// task every repo can opt into (astromech#delivery.build).
		// SENTRY_AUTH_TOKEN passthrough: packages/cli builds with sourcemaps
		// (tsdown.config.ts) that get associated with Sentry releases — the
		// token needs to be part of turbo's cache key, or a token rotation
		// wouldn't invalidate a stale cached build.
		{ name: "delivery.build", required: true, turbo: { passThroughEnv: ["SENTRY_AUTH_TOKEN"] } },
		// Audit, decomposed (epic #672, D3/#675 — the old single `audit` task's
		// 3 jobs are now separate tasks). This repo has no lighthouse config,
		// so verification.performance isn't included (matches the old
		// `run-performance` never being enabled here).
		{ name: "sourceQuality.deadCodeAnalysis", required: true },
		{ name: "delivery.bundleSize", required: true },
		// Repo/spec validation (validate-adrs.mjs, validate-registry.mjs) —
		// used to ride inside the old `lint` job with no linter connection at
		// all; now its own task (#675).
		{ name: "platform.repoValidation", required: true },
		// Publish: tag Sentry releases for the CLI package.
		{ name: "delivery.publish", with: { "sentry-project": "holocron-cli" } },
		// Sync: keep generated files (workflows, labels, …) current on push to main.
		"platform.repoSync",
		// Wiki: publish the engineering wiki to wiki.theholocron.dev/holocron.
		"knowledge.wiki",
	],
	// This repo's root scripts stay bootstrap-safe raw commands — `holocron`
	// here IS the local build artifact (`node packages/cli/dist/cli.mjs`), not
	// an installed bin — so `holocron sync` must not rewrite package.json scripts.
	syncScripts: false,
});
