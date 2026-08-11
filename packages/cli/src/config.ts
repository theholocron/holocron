/**
 * `holocron.config.json` schema, parser, and provider resolution.
 *
 * ESLint-style entry forms:
 *
 *   "source": "github"                              ← single, short
 *   "deployment": ["vercel", { team: "rando" }]    ← single, with options
 *   "notifications": ["slack", "discord"]          ← multi, short
 *   "notifications": [
 *     ["slack",   { channel: "#ops" }],
 *     ["discord", { webhook: "env:HOOK" }]
 *   ]                                              ← multi, with options
 *
 * Discriminator: an array entry is a `[provider, options]` tuple when
 * the length is 2 AND element[1] is a non-array, non-null object.
 * Otherwise it's a multi-provider list (string[] or tuple[]).
 *
 * Validation rules:
 *   - `vault` is REQUIRED (every project has secrets somewhere)
 *   - Entries for `'many'` capabilities are normalized to an array of
 *     normalized tuples; entries for `'single'` capabilities are
 *     normalized to one tuple
 *   - Tokens / secret values never appear in config — providers read
 *     them from env (or pull from `vault` at runtime)
 */

import {
	type CapabilityKey,
	CARDINALITY,
	type PagesConfig,
	REQUIRED_CAPABILITIES,
	type TeamEntry,
	type TeamPermission,
} from "./capabilities/index.js";

// ───────────────────────────────────────────────────────────────────────
// Raw config (what users write in holocron.config.json)
// ───────────────────────────────────────────────────────────────────────

export type ProviderOptions = Record<string, unknown>;

/**
 * The shape a capability config package's default export must satisfy.
 * Config packages let teams share a pre-bundled provider + options across
 * repos (Level 1 of the shareable-configs story, issue #75).
 *
 * @example
 * // @acme/holocron-vault/index.ts
 * import type { CapabilityConfigPackage } from '@theholocron/cli'
 * export default {
 *   provider: '1password',
 *   options: { vault: 'acme-app' },
 * } satisfies CapabilityConfigPackage
 */
export interface CapabilityConfigPackage {
	provider: string;
	options?: ProviderOptions;
}

export type SingleEntry = string | [provider: string, options: ProviderOptions];

export type MultiEntry = Array<string | [provider: string, options: ProviderOptions]>;

export type RawProviderEntry = SingleEntry | MultiEntry;

export type RawProvidersConfig = Partial<Record<CapabilityKey, RawProviderEntry>>;

export type RepoProtection = "balanced" | "strict" | "none";

export type { PagesConfig, TeamEntry, TeamPermission };

/**
 * Raw `docs` config as written by the user. `build` is optional so the
 * field can be declared without committing to a build type yet; setup
 * will error if `docs` is present but `build` is absent.
 */
export interface DocsConfig {
	/**
	 * GitHub Pages build source.
	 * "workflow" → GitHub Actions  (PUT { build_type: "workflow" })
	 * "branch"   → classic gh-pages branch (PUT { build_type: "legacy", source: { branch: "gh-pages", path: "/" } })
	 * When absent, Pages is not managed by `holocron setup`.
	 */
	build?: "workflow" | "branch";
	/**
	 * Custom domain / CNAME (e.g. "docs.theholocron.dev").
	 * When set and `homepage` is not explicitly provided, setup derives
	 * `homepage` as `https://{domain}/` for package.json and the repo website field.
	 */
	domain?: string;
	/** Enforce HTTPS. Only effective once the custom domain is DNS-verified. */
	https?: boolean;
}

export interface RepoProperties {
	lifecycle?: "active" | "experimental" | "deprecated";
	open_source?: boolean;
	runtime_environment?: "node" | "browser" | "universal" | "none";
	uses_external_packages?: boolean;
}

export interface RepoConfig {
	/** "owner/name" — the GitHub repository coordinate. Derived from the git remote when absent. */
	name?: string;
	/**
	 * Branch protection preset applied by `holocron setup`. When omitted,
	 * no protection is applied and no `branch_protection_level` property is set.
	 */
	protection?: RepoProtection;
	/** CI check context names required on the default branch (only used when `protection` is "strict"). */
	requiredChecks?: string[];
	/**
	 * GitHub teams granted repository access. Synced by `holocron setup`, which
	 * also writes `.github/CODEOWNERS` for teams with write-or-higher permission.
	 * String shorthand defaults to `push` (Write).
	 */
	teams?: TeamEntry[];
	/** GitHub topics set on the repository. */
	topics?: string[];
	/** GitHub custom properties synced to the org dashboard. */
	properties?: RepoProperties;
}

export interface AppConfig {
	name: string;
	path: string;
	kind?: string;
}

export interface DoctorConfig {
	checks?: string[];
}

export interface EnvConfig {
	/**
	 * Namespace prefixes used by this project's env vars.
	 * Listed from least- to most-specific (cascade model — last wins).
	 * Tooling reads this to generate `.env.example`, validate required
	 * vars, and produce documentation. Runtime code passes the same
	 * value to `createEnvParser({ namespaces })` from `@theholocron/env-utils`.
	 *
	 * @example
	 * // Project-only prefix
	 * namespaces: ["CLI_TEMPLATE"]
	 *
	 * // Org-wide defaults + project-specific overrides
	 * namespaces: ["HOLOCRON", "MY_CLI"]
	 */
	namespaces?: string[];
}

/**
 * A single Chromatic project entry in a monorepo `run-chromatic` config.
 * Each entry produces one matrix job in CI, publishing to a separate Chromatic project.
 *
 * The `tokenName` maps to a repository secret named `CHROMATIC_PROJECT_TOKEN_<TOKENNAME>`.
 * Additional fields correspond to chromaui/action inputs and are passed through directly.
 *
 * @see https://www.chromatic.com/docs/monorepos/
 */
export interface ChromaticProjectConfig {
	/**
	 * Secret suffix. The CI job reads `CHROMATIC_PROJECT_TOKEN_<tokenName>`.
	 * Must be uppercase (e.g. `"WEB"`, `"UI"`).
	 */
	tokenName: string;
	/**
	 * Path to run the Chromatic build from, relative to the repo root.
	 * Typically the package directory (e.g. `"apps/web"`, `"packages/ui"`).
	 */
	workingDir: string;
	/**
	 * Script name to build Storybook. Defaults to `"build:storybook"`.
	 * Must accept `--output-dir` pass-through (use `turbo run … --` at root).
	 */
	buildScript?: string;
	/**
	 * Path to the Storybook folder relative to `workingDir`, for TurboSnap.
	 * Tells Chromatic where to find `.storybook/` when the Storybook config
	 * is in a subdirectory. Corresponds to `--storybook-base-dir`.
	 */
	storybookBaseDir?: string;
	/**
	 * Glob patterns of files/dirs that should NOT trigger a TurboSnap bailout
	 * when changed. Useful for ignoring non-UI changes in a monorepo
	 * (e.g. `"./packages/!(ui)/**"` to focus TurboSnap on the UI package).
	 * Corresponds to `--untraced`. Accepts a single glob string or array.
	 */
	untraced?: string | string[];
	/**
	 * Glob patterns matching story files to snapshot. When set, only matching
	 * stories are captured. Corresponds to `--only-story-files`.
	 * Cannot be combined with `onlyStoryNames`.
	 */
	onlyStoryFiles?: string;
	/**
	 * Exit with code 0 even when visual changes are detected.
	 * Useful during initial setup before baselines are approved.
	 * Corresponds to `--exit-zero-on-changes`.
	 */
	exitZeroOnChanges?: boolean;
}

/**
 * Typed `with:` inputs for the `test` reusable workflow.
 * `run-chromatic` accepts either a plain boolean (single-project) or a
 * `ChromaticProjectConfig[]` object (multi-project monorepo).
 */
export type WorkflowWithConfig = Record<string, unknown> & {
	"run-chromatic"?: boolean | { projects: ChromaticProjectConfig[] };
};

export interface HolocronConfig {
	/** Project name. Derived from package.json when absent. */
	name?: string;
	description?: string;
	/** Project homepage URL. Synced to package.json#homepage and the GitHub repo's website field by `holocron sync`. */
	homepage?: string;
	/**
	 * Repository identity and metadata. When set, `PluginLoader` injects
	 * `repo.name` into every plugin's `RuntimeContext.repo` so plugins that
	 * need a repo (github, etc.) don't require `--repo` on every invocation.
	 * `--repo` on the command line still overrides.
	 */
	repo?: RepoConfig;
	/**
	 * CI workflow names to install as thin wrappers during `holocron setup`.
	 * Each name maps to a reusable workflow in `theholocron/.github`.
	 * Use the object form to pass `with:` inputs to the reusable workflow.
	 *
	 * Supported values: "lint" | "test" | "typecheck" | "codeql" | "review" |
	 *   "release" | "stale" | "greetings" | "dependencies" | "bookkeeping" | "audit" |
	 *   "deploy-docs"
	 *
	 * `holocron setup` writes `.github/workflows/<name>.yml` for each entry,
	 * calling the corresponding `ci-<name>.yml@main` reusable workflow.
	 * Files are overwritten on each run — they are generated artifacts.
	 *
	 * Use `paths` to append additional `on.push.paths` entries beyond the
	 * template default (e.g. the repo-specific docs content package path).
	 *
	 * ### run-chromatic
	 * For a single-project repo, use `"run-chromatic": true` with a
	 * `CHROMATIC_PROJECT_TOKEN` repository secret.
	 *
	 * For monorepos with multiple Storybooks, use the object form:
	 * ```ts
	 * "run-chromatic": {
	 *   projects: [
	 *     { tokenName: "WEB", workingDir: "apps/web" },
	 *     { tokenName: "UI",  workingDir: "packages/ui" },
	 *   ]
	 * }
	 * ```
	 * Each `tokenName` maps to a repository secret named
	 * `CHROMATIC_PROJECT_TOKEN_<TOKENNAME>`. `holocron setup` expands this
	 * to the flat `run-chromatic: true` + `chromatic-projects: <json>` inputs
	 * that the reusable workflow accepts.
	 *
	 * @example
	 * ["lint", { "name": "release", "with": { "run-build": false } }]
	 * { "name": "deploy-docs", "with": { "name": "configs" }, "paths": ["packages/configs-docs/**"] }
	 */
	workflows?: Array<string | { name: string; with?: WorkflowWithConfig; paths?: string[] }>;
	providers: RawProvidersConfig;
	apps?: AppConfig[];
	doctor?: DoctorConfig;
	/**
	 * Agent runtime that determines where skills are installed by `holocron setup`.
	 * Skills are installed to `.agents/skills/<name>/` (canonical) with a
	 * relative symlink at the agent-specific path:
	 * - `"claude"` → `.claude/skills/<name>` → `../../.agents/skills/<name>`
	 * - `"codex"` | `"gemini"` → logged as unsupported; skipped gracefully.
	 */
	agent?: "claude" | "codex" | "gemini";
	/**
	 * Skill names from `@theholocron/skills` to install during `holocron setup`.
	 * Installed paths are gitignored and managed by setup — do not commit them.
	 *
	 * @example
	 * ["git-safety", "pr-workflow", "commit-standards"]
	 */
	skills?: string[];
	/**
	 * GitHub Pages configuration. When present, `holocron setup` calls the
	 * Pages API using `HOLOCRON_DEPLOY_TOKEN` (requires `pages:write` + `repo` scope).
	 * When absent, Pages is left as-is.
	 *
	 * @example
	 * { build: "workflow", domain: "docs.theholocron.dev", https: true }
	 */
	docs?: DocsConfig;
	/**
	 * Environment variable namespace configuration.
	 * Declares the prefix(es) this project uses for its env vars so that
	 * tooling can generate `.env.example`, validate required vars, and
	 * produce accurate documentation without hard-coding prefix strings.
	 *
	 * @example
	 * { namespaces: ["HOLOCRON", "MY_CLI"] }
	 */
	env?: EnvConfig;
}

// ───────────────────────────────────────────────────────────────────────
// Resolved config (what the runtime sees after parsing)
// ───────────────────────────────────────────────────────────────────────

export interface ResolvedTuple {
	provider: string;
	/** Resolved package name (`@theholocron/holocron-plugin-<provider>` for short refs). */
	packageName: string;
	options: ProviderOptions;
}

export type ResolvedProviderEntry =
	| { cardinality: "single"; tuple: ResolvedTuple }
	| { cardinality: "many"; tuples: ResolvedTuple[] };

export type ResolvedProvidersConfig = Partial<Record<CapabilityKey, ResolvedProviderEntry>>;

export interface ResolvedHolocronConfig {
	name: string;
	description?: string;
	homepage?: string;
	repo?: RepoConfig;
	workflows?: Array<string | { name: string; with?: WorkflowWithConfig; paths?: string[] }>;
	providers: ResolvedProvidersConfig;
	apps: AppConfig[];
	doctor: DoctorConfig;
	agent?: "claude" | "codex" | "gemini";
	skills?: string[];
	/** Resolved Pages config. `build` is guaranteed present when this field exists. */
	docs?: PagesConfig;
	env?: EnvConfig;
}

// ───────────────────────────────────────────────────────────────────────
// Errors
// ───────────────────────────────────────────────────────────────────────

export class ConfigError extends Error {
	override name = "ConfigError";
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const PLUGIN_PREFIX = "@theholocron/holocron-plugin-";
const COMMUNITY_PREFIX = "holocron-plugin-";

/**
 * Resolve `"github"` → `"@theholocron/holocron-plugin-github"`.
 * Fully-qualified names (scoped or not) are honored verbatim, which
 * is how third-party plugins published outside the org work.
 */
export function resolvePluginPackage(provider: string): string {
	if (!provider) throw new ConfigError("provider name is empty");
	if (provider.startsWith("@")) return provider;
	if (provider.startsWith(COMMUNITY_PREFIX)) return provider;
	if (provider.includes("/")) return provider;
	return PLUGIN_PREFIX + provider;
}

/** A bare `[provider, options]` tuple, with both elements present? */
function isOptionsTuple(value: unknown): value is [string, ProviderOptions] {
	if (!Array.isArray(value)) return false;
	if (value.length !== 2) return false;
	if (typeof value[0] !== "string") return false;
	const opt = value[1];
	return typeof opt === "object" && opt !== null && !Array.isArray(opt);
}

function normalizeEntry(entry: string | [string, ProviderOptions]): ResolvedTuple {
	if (typeof entry === "string") {
		return { provider: entry, packageName: resolvePluginPackage(entry), options: {} };
	}
	const [provider, options] = entry;
	return { provider, packageName: resolvePluginPackage(provider), options };
}

// ───────────────────────────────────────────────────────────────────────
// Parse / resolve
// ───────────────────────────────────────────────────────────────────────

export function resolveEntry(key: CapabilityKey, raw: RawProviderEntry): ResolvedProviderEntry {
	const cardinality = CARDINALITY[key];

	// Single short form: "github"
	if (typeof raw === "string") {
		if (cardinality === "many") {
			throw new ConfigError(`\`${key}\` accepts multiple providers; wrap a single one in an array: ["${raw}"]`);
		}
		return { cardinality: "single", tuple: normalizeEntry(raw) };
	}

	if (!Array.isArray(raw)) {
		throw new ConfigError(`\`${key}\` entry must be a string or array, got ${typeof raw}`);
	}

	// Single options tuple: ["vercel", { team: "rando" }]
	if (isOptionsTuple(raw)) {
		if (cardinality === "many") {
			// Same shape, but cardinality forces multi — promote to one-element list
			return { cardinality: "many", tuples: [normalizeEntry(raw)] };
		}
		return { cardinality: "single", tuple: normalizeEntry(raw) };
	}

	// Multi list — array of strings, tuples, or a mix
	if (cardinality === "single") {
		throw new ConfigError(
			`\`${key}\` accepts exactly one provider; got a multi-provider list with ${raw.length} entries`
		);
	}

	const tuples = raw.map((entry, idx) => {
		if (typeof entry === "string") return normalizeEntry(entry);
		if (isOptionsTuple(entry)) return normalizeEntry(entry);
		throw new ConfigError(`\`${key}[${idx}]\` must be a provider string or [provider, options] tuple`);
	});

	return { cardinality: "many", tuples };
}

export function resolveConfig(raw: HolocronConfig): ResolvedHolocronConfig {
	if (!raw.name) {
		throw new ConfigError("`name` is required");
	}
	if (!raw.providers || typeof raw.providers !== "object") {
		throw new ConfigError("`providers` block is required");
	}

	const providers: ResolvedProvidersConfig = {};
	for (const [key, entry] of Object.entries(raw.providers)) {
		if (entry === undefined) continue;
		providers[key as CapabilityKey] = resolveEntry(key as CapabilityKey, entry as RawProviderEntry);
	}

	for (const required of REQUIRED_CAPABILITIES) {
		if (!providers[required]) {
			throw new ConfigError(`required capability \`${required}\` is missing from providers`);
		}
	}

	// Validate docs and narrow build to required
	let docs: PagesConfig | undefined;
	if (raw.docs !== undefined) {
		if (!raw.docs.build) {
			throw new ConfigError("`docs.build` is required when `docs` is set");
		}
		docs = raw.docs as PagesConfig;
	}

	// Derive homepage from docs.domain when not explicitly set
	const homepage = raw.homepage ?? (docs?.domain ? `https://${docs.domain}/` : undefined);

	return {
		name: raw.name,
		description: raw.description,
		homepage,
		repo: raw.repo,
		workflows: raw.workflows,
		providers,
		apps: raw.apps ?? [],
		doctor: raw.doctor ?? {},
		agent: raw.agent,
		skills: raw.skills,
		docs,
		env: raw.env,
	};
}
