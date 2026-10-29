import { execSync } from "node:child_process";

import { defineConfig, type UserConfig } from "tsdown";

import { checkBundleSize } from "./check-bundle-size.js";
import { resolveEntry, resolveOutDir } from "./resolve-entry.js";

/**
 * tsdown preset for a published ESM library.
 * Single entry point, generates types, externalizes every dependency.
 *
 * `neverBundle: true` externalizes every bare-specifier import, not just
 * `@theholocron/*` peers -- the narrower regex this used to carry only
 * ever protected org packages, so a package with real third-party runtime
 * deps (e.g. google-client's googleapis/google-auth-library) got them
 * bundled by default. Confirmed harmless there today only because
 * rolldown's tree-shaking happened to strip the unreachable code back out
 * before final emit -- fragile (a future import could reach code that
 * doesn't shake away) and slow (~15s vs sub-second for a properly
 * externalized build).
 *
 * After every successful build, `onSuccess` fails it if an emitted bundle is
 * over 500KB -- the symptom of a dependency that failed to externalize
 * (holocron#762). A caller's own `onSuccess` (function or shell command) runs after the check.
 */
export function library(options: UserConfig = {}) {
	const merged: UserConfig = {
		entry: ["src/index.ts"],
		outDir: "dist",
		format: "esm",
		dts: true,
		clean: true,
		deps: { neverBundle: true },
		...options,
	};
	const userOnSuccess = options.onSuccess;
	return defineConfig({
		...merged,
		entry: resolveEntry(merged.entry),
		outDir: resolveOutDir(merged.outDir ?? "dist"),
		onSuccess: async (config, signal) => {
			checkBundleSize(config.outDir);
			if (typeof userOnSuccess === "function") await userOnSuccess(config, signal);
			else if (userOnSuccess) execSync(userOnSuccess, { stdio: "inherit" });
		},
	});
}

/** Ready-to-use config for packages that need no customisation. */
export default library();
