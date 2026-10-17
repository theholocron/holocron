/**
 * Lists the packages a built bundle imports that aren't declared
 * dependencies (holocron#922). `stage-deploy.mjs` writes a trimmed
 * `package.json` holding only this package's own `dependencies`, and Vercel
 * installs exactly those. `tsdown.config.ts` inlines the workspace packages
 * but leaves *their* npm imports external, so a new dependency of
 * `@theholocron/cli` (say) shows up as an import in `dist/` that nothing
 * installs. Caught at staging instead of as a "Cannot find module" crash.
 *
 * Its own module, not inlined in `stage-deploy.mjs`, so it can be
 * unit-tested without running the staging script's side effects.
 */

/** `"@scope/pkg/sub"` → `"@scope/pkg"`, `"pkg/sub"` → `"pkg"`. */
function packageName(specifier) {
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * @param {string} source The built bundle's code.
 * @param {Record<string, string>} dependencies The package's declared `dependencies`.
 * @returns {string[]} Sorted package names imported but not declared; `node:` builtins excluded.
 */
export function undeclaredExternals(source, dependencies) {
	const STATIC = /^\s*(?:import|export)\b[^"'\n;]*?["']([^"'./][^"']*)["']/gm;
	const DYNAMIC = /\bimport\(\s*["']([^"'./][^"']*)["']\s*\)/g;
	const specifiers = [...source.matchAll(STATIC), ...source.matchAll(DYNAMIC)].map((m) => m[1]);
	const imported = new Set(specifiers.filter((s) => !s.startsWith("node:")).map(packageName));
	return [...imported].filter((name) => !(name in dependencies)).sort();
}
