import { type PackageJson } from "@theholocron/pkg-utils";

/**
 * Derived custom-properties (#677). Unlike the existing 6 GitHub
 * custom-properties fields (`lifecycle`, `open_source`, `runtime_environment`,
 * `uses_external_packages`, `monorepo`, `branch_protection_level`) — which
 * mirror what `holocron.config.ts` already states explicitly — these four are
 * *derived*: signal that isn't an explicit config field today (framework
 * choice, repo archetype, capability drift). See
 * `docs/wiki/specifications/tech-holocron-platform.spec.md` → "Custom-properties sync — field
 * definitions (#677)" for the full design.
 */

// "plugin" isn't produced by any heuristic below yet — no repo in the org
// today is a standalone single-purpose plugin at the *repo* level (plugin
// packages live inside `holocron`'s own `plugins/holocron-plugin-*`, which
// makes `holocron` itself "platform", not "plugin"). Kept in the union for a
// future cross-org (`rando`, D10) repo that's nothing but one plugin.
export type HolocronProfile = "library" | "cli" | "plugin" | "template" | "app" | "docs" | "platform";

/** The `package.json` shape profile derivation reads — `@theholocron/pkg-utils`'s `PackageJson`, under the name Sentinel already imports. */
export type PackageJsonLike = PackageJson;

export interface DeriveProfileInput {
	rootPackageJson: PackageJsonLike | null;
	repoName: string;
	isMonorepo: boolean;
	/** `packages/*` package.json contents, monorepo repos only — used to find the primary published artifact. */
	workspacePackageJsons: PackageJsonLike[];
}
