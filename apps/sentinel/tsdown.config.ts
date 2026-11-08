import { library } from "@theholocron/tsdown-config/presets/library";

/**
 * The workspace packages Sentinel imports, inlined into `dist/` instead of
 * left for Vercel to `npm install` (holocron#922). They're versioned in
 * lockstep with the repo, and Vercel installs a version from npm, so a
 * deploy made between a merge and its release pinned the *previous*
 * release: Sentinel's code imported `mergeTasksLayers` (holocron#917) from
 * an astromech that didn't have it yet, and every webhook crashed. Inlined,
 * `dist/` carries exactly the workspace code it was built and tested with.
 *
 * Only their own code is inlined. Every other bare import (their npm
 * dependencies included) stays external: `@theholocron/cli` reaches a
 * platform-specific native binary (`@napi-rs/keyring`), which must be
 * installed on Vercel's Linux runtime, not bundled from the build machine.
 * `holocron deploy stage` checks each external is a declared
 * dependency, so the trimmed deploy `package.json` installs it.
 */
const INLINED = /^@theholocron\/(?:astromech|datapad|cli)(?:\/|$)/;

/**
 * The size check's limit for this bundle. The preset's 512KB is sized for a thin package that bundles nothing, and
 * Sentinel's bundle is 511KB because it inlines the packages above on purpose, so any feature would have failed the
 * build. 600KB keeps the check's purpose, catching a dependency inlined by mistake (that adds megabytes), and leaves
 * room to grow; raise it again, with the same reasoning, if Sentinel's own code outgrows it.
 */
const MAX_BUNDLE_BYTES = 600_000;

export default library(
	{
		deps: {
			// Bare specifiers (including `node:` builtins) other than the inlined
			// packages; relative and already-resolved absolute paths are bundled.
			neverBundle: (id: string) => /^[^./]/.test(id) && !INLINED.test(id),
			alwaysBundle: [INLINED],
		},
	},
	{ maxBundleBytes: MAX_BUNDLE_BYTES }
);
