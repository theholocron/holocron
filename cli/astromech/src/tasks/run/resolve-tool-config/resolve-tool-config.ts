import { join } from "node:path";

import { resolveExportEntry } from "../resolve-export-entry/index.js";
import { LOCAL_CONFIG_FILES, TOOL_CONFIGS } from "../tool-configs/index.js";
import type { ResolverDeps } from "./resolve-tool-config.type.js";

/**
 * Resolves the absolute path to a Bucket A tool's shared `@theholocron/*-config`
 * entry point, installed in the consuming repo's own `node_modules` — and the
 * CLI flag(s) to hand it via (`--config`, `--extends`, …). `run.ts` splices the
 * result into the command it builds for a tool/detect runner or a linter-group
 * entry, right after the tool's own args.
 *
 * Every mapped package's resolved entry point already carries a ready-to-use
 * default export (a plain re-export for `prettier`/`commitlint`; an invoked,
 * zero-arg preset for `eslint`/`vitest`/`tsdown` — verified end-to-end against
 * each tool's real `--config`/`--extends` loader, not just the file's shape).
 * A repo doesn't need this package installed at all — every lookup degrades to
 * `[]` (no flag added, the tool falls back to its own auto-discovery of a
 * local file, unchanged from today) rather than throwing.
 *
 * **Local file wins.** A `<tool>.config.*` sitting in `cwd` (whether it's
 * pure boilerplate or has real per-package customization on top of the
 * shared bundle, e.g. `mergeConfig(base, { test: { coverage: { exclude }
 * } })`) always skips the splice, even when the shared package is also
 * installed — an explicit `--config <shared path>` flag beats a tool's own
 * auto-discovery every time, so splicing it unconditionally would silently
 * discard that customization the file is still sitting right there on disk.
 * The shared bundle is only ever the fallback for a package with *no* local
 * file at all — that's still the "delete the file to go fully shared" path
 * this was designed for (#676); it just isn't unconditional (#749).
 *
 * `semantic-release`, `devmoji`, `editorconfig-checker`, and `knip` are
 * deliberately absent — `semantic-release-config`'s `defineConfig()` needs
 * real per-repo data (branches, npm options) a static `--extends <path>` can't
 * carry; `devmoji` runs through a git hook template, not `holocron run
 * <task>`; `editorconfig-checker` has no shared-config package yet; `knip` is
 * repo-specific by nature, never a shared-config candidate. See
 * `.notes/tech-config-resolution.spec.md` (#676).
 */

/**
 * `<flag> <absolute path>` for `tool`, resolved against `cwd`'s
 * `node_modules` — or `[]` when the tool isn't mapped, `cwd` already has its
 * own local config file for it (#749 — local always wins, customized or
 * not), the shared package isn't installed, its `package.json` doesn't
 * declare the export subpath this needs, or the resolved file doesn't
 * actually exist on disk (a stale install, or a package version that
 * predates the export existing).
 */
export function resolveToolConfig(tool: string, cwd: string, deps: ResolverDeps): string[] {
	const spec = TOOL_CONFIGS[tool];
	if (!spec) return [];

	// `?? []` is defensive only — every key in TOOL_CONFIGS has a matching
	// LOCAL_CONFIG_FILES entry today, and the `!spec` guard above already
	// returns for any tool absent from TOOL_CONFIGS.
	/* istanbul ignore next -- see comment above */
	const localFiles = LOCAL_CONFIG_FILES[tool] ?? [];
	if (localFiles.some((name) => deps.fileExists(join(cwd, name)))) return [];

	const pkgDir = join(cwd, "node_modules", ...spec.package.split("/"));
	const pkgJsonPath = join(pkgDir, "package.json");
	if (!deps.fileExists(pkgJsonPath)) return [];

	let pkg: { exports?: Record<string, unknown> };
	try {
		pkg = JSON.parse(deps.readFile(pkgJsonPath)) as { exports?: Record<string, unknown> };
	} catch {
		return [];
	}

	const relative = resolveExportEntry(pkg.exports?.[spec.exportPath]);
	if (!relative) return [];

	// `join` normalizes the "./" prefix every package.json#exports value carries.
	const absolute = join(pkgDir, relative);
	if (!deps.fileExists(absolute)) return [];

	return [...spec.flag, absolute];
}
