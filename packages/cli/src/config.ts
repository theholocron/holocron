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

import { CARDINALITY, type CapabilityKey, REQUIRED_CAPABILITIES } from "./capabilities/index.js";

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

export interface RepoPolicyConfig {
	/**
	 * "balanced" — squash-only merges, delete-branch-on-merge, issues/discussions/projects
	 * enabled, auto-merge enabled, web sign-off required, always suggest updating, no wiki;
	 * plus a ruleset that blocks force-push + deletion and requires a pull request (0 reviews).
	 *
	 * "strict" — everything in "balanced" plus required status checks from `requiredChecks`.
	 *
	 * "none" — skips repo settings + ruleset entirely.
	 *
	 * @default "balanced"
	 */
	preset?: "balanced" | "strict" | "none";
	/** CI check context names required on the default branch (used by "strict"). */
	requiredChecks?: string[];
}

export interface AppConfig {
	name: string;
	path: string;
	kind?: string;
}

export interface DoctorConfig {
	checks?: string[];
}

export interface HolocronConfig {
	project: {
		name: string;
		description?: string;
		/**
		 * Repo coord — `"owner/name"`. When set, `PluginLoader` injects
		 * it into every plugin's `RuntimeContext.repo` so plugins that
		 * need a repo (github, etc.) don't require `--repo` on every
		 * invocation. `--repo` on the command line still overrides.
		 */
		repo?: string;
		/**
		 * Repo-level policy applied by `holocron setup`. Defines merge
		 * strategy, branch protection rulesets, and security defaults.
		 * Requires `source` capability to be configured.
		 */
		repoPolicy?: RepoPolicyConfig;
		/**
		 * CI workflow names to install as thin wrappers during `holocron setup`.
		 * Each name maps to a reusable workflow in `theholocron/.github`.
		 * Use the object form to pass `with:` inputs to the reusable workflow.
		 *
		 * Supported values: "lint" | "test" | "typecheck" | "codeql" | "review" |
		 *   "release" | "stale" | "greetings" | "dependencies" | "bookkeeping-pr" | "audit"
		 *
		 * `holocron setup` writes `.github/workflows/<name>.yml` for each entry,
		 * calling the corresponding `ci-<name>.yml@main` reusable workflow.
		 * Files are overwritten on each run — they are generated artifacts.
		 *
		 * @example
		 * ["lint", { "name": "release", "with": { "run-build": false } }]
		 */
		workflows?: Array<string | { name: string; with?: Record<string, unknown> }>;
	};
	providers: RawProvidersConfig;
	apps?: AppConfig[];
	doctor?: DoctorConfig;
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
	project: HolocronConfig["project"];
	providers: ResolvedProvidersConfig;
	apps: AppConfig[];
	doctor: DoctorConfig;
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
	if (!raw.project?.name) {
		throw new ConfigError("`project.name` is required");
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

	return {
		project: raw.project,
		providers,
		apps: raw.apps ?? [],
		doctor: raw.doctor ?? {},
	};
}
