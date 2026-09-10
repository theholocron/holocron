import { defineConfig } from "@theholocron/astromech/config";

/**
 * The task-runner layer for this repo.
 *
 * Split out from `holocron.config.ts` to dogfood the two-file config system
 * (ADR-0009): `holocron.config.ts` carries the `@theholocron/holocron-config`
 * preset tasks (lint / test / typecheck / …), this file adds the repo-specific
 * ones. astromech's `loadTasksConfig` merges them — task arrays concatenate,
 * this file wins on scalars — and `holocron run` / `holocron ci` / `holocron
 * setup` / `holocron sync` all read the merged manifest.
 */
export default defineConfig({
	tasks: [
		// Audit: Knip dead-code analysis on top of the standard bundle audit.
		// The preset carries "audit / Conclusion" as an extra required check;
		// this adds the actual task with the repo's knip option.
		{ name: "audit", required: true, with: { "run-knip": true } },
		// Release: tag Sentry releases for the CLI package.
		{ name: "release", with: { "sentry-project": "holocron-cli" } },
		// Sync: keep generated files (workflows, labels, …) current on push to main.
		"sync",
		// Wiki: publish the engineering wiki to wiki.theholocron.dev/holocron.
		"wiki",
	],
	// This repo's root scripts stay bootstrap-safe raw commands — `holocron`
	// here IS the local build artifact (`node packages/cli/dist/cli.mjs`), not
	// an installed bin — so `holocron sync` must not rewrite package.json scripts.
	syncScripts: false,
});
