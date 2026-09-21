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

export interface ResolverDeps {
	readFile: (path: string) => string;
	fileExists: (path: string) => boolean;
}

interface ToolConfigSpec {
	/** `@theholocron/*-config` package name. */
	package: string;
	/** `package.json#exports` subpath key — `"."` or `"./bundles/library"`. */
	exportPath: string;
	/** Flag(s) to prepend before the resolved path, e.g. `["--config"]`. */
	flag: string[];
}

/**
 * `library` is every mapped tool's org-wide default variant today — every
 * currently-migrated repo (`holocron`, `clients`, `utils`, `configs`,
 * `themes`, `observability`, `skills`) is a publishable library package, and
 * `eslint-config`/`vitest-config`/`tsdown-config` all name their
 * general-purpose preset exactly that. Picking a different variant per repo
 * (an app-type template, say) needs new `holocron.config.ts` surface this
 * doesn't add yet — deliberately out of scope until a real consumer needs it.
 */
const TOOL_CONFIGS: Readonly<Record<string, ToolConfigSpec>> = {
	eslint: { package: "@theholocron/eslint-config", exportPath: "./bundles/library", flag: ["--config"] },
	prettier: { package: "@theholocron/prettier-config", exportPath: ".", flag: ["--config"] },
	vitest: { package: "@theholocron/vitest-config", exportPath: "./bundles/library", flag: ["--config"] },
	tsdown: { package: "@theholocron/tsdown-config", exportPath: "./presets/library", flag: ["--config"] },
	commitlint: { package: "@theholocron/commitlint-config", exportPath: ".", flag: ["--config"] },
};

/**
 * Every filename a tool's own auto-discovery would pick up from `cwd` —
 * same extension set `registry.ts`'s `turbo.inputs`/`local.detect` entries
 * already use for these tools, kept in sync by hand (no shared source of
 * truth between the two today). Presence of any one of these means the
 * package has its own local config — customized or not, `resolveToolConfig`
 * can't tell the difference from the filename alone, so it defers to it
 * either way (#749).
 */
const LOCAL_CONFIG_FILES: Readonly<Record<string, readonly string[]>> = {
	eslint: ["eslint.config.ts", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"],
	prettier: ["prettier.config.ts", "prettier.config.js", "prettier.config.mjs", "prettier.config.cjs"],
	vitest: ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"],
	tsdown: ["tsdown.config.ts", "tsdown.config.js", "tsdown.config.mjs", "tsdown.config.cjs"],
	commitlint: ["commitlint.config.ts", "commitlint.config.js", "commitlint.config.mjs", "commitlint.config.cjs"],
};

/** Every tool name the resolver knows how to point at a shared config. */
export const RESOLVABLE_TOOLS: ReadonlySet<string> = new Set(Object.keys(TOOL_CONFIGS));

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
	if (localFiles.some((name) => deps.fileExists(joinPath(cwd, name)))) return [];

	const pkgDir = joinPath(cwd, "node_modules", ...spec.package.split("/"));
	const pkgJsonPath = joinPath(pkgDir, "package.json");
	if (!deps.fileExists(pkgJsonPath)) return [];

	let pkg: { exports?: Record<string, unknown> };
	try {
		pkg = JSON.parse(deps.readFile(pkgJsonPath)) as { exports?: Record<string, unknown> };
	} catch {
		return [];
	}

	const relative = resolveExportEntry(pkg.exports?.[spec.exportPath]);
	if (!relative) return [];

	// package.json#exports values are always "./"-prefixed relative paths —
	// strip it before joining, or the segment survives untouched (joinPath
	// only trims leading/trailing "/", not a leading ".") and produces an
	// inert "/pkg/./dist/…" that a plain fileExists()-by-string-match never
	// resolves against, even though Node's own resolver would tolerate it.
	const absolute = joinPath(pkgDir, relative.replace(/^\.\//, ""));
	if (!deps.fileExists(absolute)) return [];

	return [...spec.flag, absolute];
}

/**
 * Unwrap a `package.json#exports` subpath entry down to its file path —
 * either a bare string, or an object with condition keys (`import`,
 * `default`, `require`, …) that may themselves nest one level (`{ import: {
 * types, default } }`, the shape every `@theholocron/*-config` package
 * actually uses). Prefers `import` (this org ships ESM), then `default`,
 * then `require` as a last resort.
 */
function resolveExportEntry(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	if (entry === null || typeof entry !== "object") return undefined;

	const conditions = entry as Record<string, unknown>;
	const value = conditions.import ?? conditions.default ?? conditions.require;
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null) return resolveExportEntry(value);
	return undefined;
}

/**
 * A minimal, POSIX-safe `path.join` — avoids importing `node:path` just for
 * this. Every path in play here is either already POSIX (a `package.json`
 * `exports` value, always forward-slashed regardless of platform) or built
 * from platform-neutral segments (`cwd`, `"node_modules"`, a scoped package
 * name split on `/`), so a manual join is safe and keeps this module
 * dependency-free like the rest of `run.ts`'s helpers.
 */
function joinPath(...segments: string[]): string {
	return segments
		.map((s, i) => (i === 0 ? s.replace(/\/+$/, "") : s.replace(/^\/+|\/+$/g, "")))
		.filter(Boolean)
		.join("/");
}
