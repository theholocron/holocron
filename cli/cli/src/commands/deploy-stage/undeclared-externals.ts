/** `"@scope/pkg/sub"` → `"@scope/pkg"`, `"pkg/sub"` → `"pkg"`. */
function packageName(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/**
 * Lists the packages a built bundle imports that aren't declared
 * dependencies (holocron#922). `deploy stage` writes a trimmed
 * `package.json` holding only the package's own `dependencies`, and the host
 * installs exactly those. A bundler that inlines workspace packages but leaves
 * *their* npm imports external turns a new dependency of one of them into an
 * import in `dist/` that nothing installs. Caught at staging instead of as a
 * "Cannot find module" crash.
 *
 * @param source The built bundle's code.
 * @param dependencies The package's declared `dependencies`.
 * @returns Sorted package names imported but not declared; `node:` builtins excluded.
 */
export function undeclaredExternals(source: string, dependencies: Record<string, string>): string[] {
	const STATIC = /^\s*(?:import|export)\b[^"'\n;]*?["']([^"'./][^"']*)["']/gm;
	const DYNAMIC = /\bimport\(\s*["']([^"'./][^"']*)["']\s*\)/g;
	const specifiers = [...source.matchAll(STATIC), ...source.matchAll(DYNAMIC)].map((m) => m[1]!);
	const imported = new Set(specifiers.filter((s) => !s.startsWith("node:")).map(packageName));
	return [...imported].filter((name) => !(name in dependencies)).sort();
}
