import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspacePackage } from "@theholocron/astromech";

import type { ResolvedProvidersConfig } from "../../config/config.js";

/**
 * Derived custom-properties (#677). Unlike the existing 6 GitHub
 * custom-properties fields (`lifecycle`, `open_source`, `runtime_environment`,
 * `uses_external_packages`, `monorepo`, `branch_protection_level`) — which
 * mirror what `holocron.config.ts` already states explicitly — these four are
 * *derived*: signal that isn't an explicit config field today (framework
 * choice, repo archetype, capability drift). See
 * `.notes/tech-holocron-platform.spec.md` → "Custom-properties sync — field
 * definitions (#677)" for the full design.
 */

// "plugin" isn't produced by any heuristic below yet — no repo in the org
// today is a standalone single-purpose plugin at the *repo* level (plugin
// packages live inside `holocron`'s own `packages/holocron-plugin-*`, which
// makes `holocron` itself "platform", not "plugin"). Kept in the union for a
// future cross-org (`rando`, D10) repo that's nothing but one plugin.
export type HolocronProfile = "library" | "cli" | "plugin" | "template" | "app" | "docs" | "platform";

export interface PackageJsonLike {
	name?: string;
	private?: boolean;
	bin?: unknown;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export interface DeriveProfileInput {
	rootPackageJson: PackageJsonLike | null;
	repoName: string;
	isMonorepo: boolean;
	/** `packages/*` package.json contents, monorepo repos only — used to find the primary published artifact. */
	workspacePackageJsons: PackageJsonLike[];
}

/**
 * Repo archetype, in priority order:
 * 1. `*-template` repo name → `template` (independent of package shape).
 * 2. Monorepo whose primary published artifact is a CLI (some workspace
 *    package has `bin`) → `platform` — matches `holocron` itself: the CLI is
 *    the deliverable, the plugin packages are supporting infrastructure for
 *    it, not separate products.
 * 3. Monorepo with no CLI but at least one non-private workspace package →
 *    `library` — matches `clients`/`configs`/`utils`/`themes`/
 *    `observability`: a family of published packages, none of them a CLI.
 *    Checked *before* falling into the root-package branch below, because
 *    these repos' own root `package.json` is private and often carries
 *    `@theholocron/astro-config` for a docs site built from the monorepo
 *    root — without this check they'd wrongly resolve to `docs` off that
 *    root-level signal alone, when the docs site is a secondary concern of
 *    a library collection, not what the repo fundamentally is.
 * 4. Single-package repo with `package.json#bin` → `cli`.
 * 5. Docs-only site (astro/starlight present, root package private, no
 *    publishable exports) → `docs`.
 * 6. Private, non-publishable, non-docs → `app`.
 * 7. Otherwise, a single publishable package → `library`.
 */
export function deriveProfile(input: DeriveProfileInput): HolocronProfile {
	if (/-template$/.test(input.repoName)) return "template";

	if (input.isMonorepo) {
		const hasPublishedCli = input.workspacePackageJsons.some((pkg) => Boolean(pkg.bin));
		if (hasPublishedCli) return "platform";

		const hasPublishedLibrary = input.workspacePackageJsons.some((pkg) => pkg.private !== true);
		if (hasPublishedLibrary) return "library";
	}

	const pkg = input.rootPackageJson;
	if (pkg?.bin) return "cli";

	const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
	const isDocsSite = Boolean(deps["@theholocron/astro-config"] || deps["astro"]);
	if (pkg?.private && isDocsSite) return "docs";
	if (pkg?.private) return "app";

	return "library";
}

const KNOWN_STACK_DEPS = [
	"next",
	"vite",
	"astro",
	"tsdown",
	"rollup",
	"webpack",
	"storybook",
	"vitest",
	"playwright",
	"turbo",
] as const;

/**
 * Detected build/framework tooling — the literal "does this repo need
 * next/vite/tsdown" signal `holocron.config.ts` has no field for today
 * (framework choice isn't a config concept, unlike `providers`/`tasks`).
 * Curated table, not exhaustive by design — add to `KNOWN_STACK_DEPS` as new
 * frameworks show up rather than trying to detect anything on npm.
 */
export function deriveStack(pkg: PackageJsonLike | null): string[] {
	const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
	return KNOWN_STACK_DEPS.filter((name) => name in deps);
}

/** The provider capability keys actually wired in `providers: {}` — zero heuristics. */
export function deriveCapabilities(providers: ResolvedProvidersConfig | undefined): string[] {
	return Object.keys(providers ?? {}).sort();
}

/**
 * `source` + `ci` are the minimal baseline every repo `holocron setup`
 * touches wires — every `holocron.config.ts` in this org already satisfies
 * this, so `non-compliant` here means drift (a provider manually removed
 * after setup), not an unmet aspirational policy. Deliberately not a richer
 * per-profile policy yet (e.g. "a `library` must have `deployment`") — that's
 * a Phase B (GitHub App) refinement once it can post *why* on a check run.
 */
const REQUIRED_BASELINE = ["source", "ci"] as const;

export function deriveCompliance(capabilities: readonly string[]): "compliant" | "non-compliant" {
	return REQUIRED_BASELINE.every((key) => capabilities.includes(key)) ? "compliant" : "non-compliant";
}

/**
 * The Phase B refinement `deriveCompliance()`'s own doc comment names —
 * *why* a repo is non-compliant, not just that it is. `[]` when compliant.
 * Same `REQUIRED_BASELINE` `deriveCompliance()` checks against — one
 * table, not two independently-maintained baselines.
 */
export function missingCapabilities(capabilities: readonly string[]): string[] {
	return REQUIRED_BASELINE.filter((key) => !capabilities.includes(key));
}

/**
 * Reads each workspace package's actual `package.json` content (not just
 * `readWorkspacePackages()`'s `{ slug, name, dir }` — `deriveProfile()`'s
 * `platform` detection needs `bin`, which that helper doesn't carry).
 * Missing/invalid files are skipped, matching `readWorkspacePackages()`'s
 * own soft-fail behavior.
 */
export async function readWorkspacePackageJsons(
	repoRoot: string,
	workspacePackages: readonly WorkspacePackage[]
): Promise<PackageJsonLike[]> {
	const results: PackageJsonLike[] = [];
	for (const { slug, dir = "packages" } of workspacePackages) {
		try {
			const raw = await readFile(join(repoRoot, dir, slug, "package.json"), "utf8");
			results.push(JSON.parse(raw) as PackageJsonLike);
		} catch {
			// no package.json or invalid JSON — skip, same as readWorkspacePackages().
		}
	}
	return results;
}
