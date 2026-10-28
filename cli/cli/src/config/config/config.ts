import {
	type CapabilityKey,
	CARDINALITY,
	type PagesConfig,
	REQUIRED_CAPABILITIES,
	type TeamEntry,
	type TeamPermission,
} from "../../plugin/capabilities/index.js";
import type {
	HolocronConfig,
	ProviderOptions,
	RawProviderEntry,
	ResolvedHolocronConfig,
	ResolvedProviderEntry,
	ResolvedProvidersConfig,
	ResolvedTuple,
} from "./config.type.js";

export type { PagesConfig, TeamEntry, TeamPermission };

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
		org: raw.org,
		domain: raw.domain,
		repo: raw.repo,
		tasks: raw.tasks,
		syncScripts: raw.syncScripts,
		holocronScript: raw.holocronScript,
		extraRequiredChecks: raw.extraRequiredChecks,
		hooks: raw.hooks,
		providers,
		apps: raw.apps ?? [],
		doctor: raw.doctor ?? {},
		agent: raw.agent,
		skills: raw.skills,
		docs,
		env: raw.env,
		log: raw.log,
		telemetry: raw.telemetry,
		eslint: raw.eslint,
	};
}
