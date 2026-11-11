import { ConfigError } from "@theholocron/kyber/config";
import { resolvePluginPackage as resolvePackage } from "@theholocron/kyber/plugins";

import {
	type CapabilityKey,
	CARDINALITY,
	type PagesConfig,
	REQUIRED_CAPABILITIES,
	type TeamEntry,
	type TeamPermission,
} from "../../plugin/capabilities/index.js";
import { validateSecretsDeploy } from "../validate-secrets-deploy/index.js";
import { validateVariablesSync } from "../validate-variables-sync/index.js";
import type {
	CredentialsConfig,
	DevConfig,
	GitHubAppConfig,
	HolocronConfig,
	IdeasConfig,
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

export { ConfigError };

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
	return resolvePackage(provider, PLUGIN_PREFIX, COMMUNITY_PREFIX);
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

/** Resolves one capability's raw provider entry into single or multiple resolved tuples, checking it against the capability's cardinality. */
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

/** A DNS hostname of at least two labels: no scheme, port, path or space. */
const HOSTNAME = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** Throws a {@link ConfigError} naming the first thing wrong with the `githubApps` list. */
function validateGitHubApps(apps: GitHubAppConfig[]): void {
	if (!Array.isArray(apps)) throw new ConfigError("`githubApps` must be a list of { name, manifest, environment }");
	apps.forEach((app, idx) => {
		for (const key of ["name", "manifest", "environment"] as const) {
			const value: unknown = app?.[key];
			if (typeof value !== "string" || value.trim() === "") {
				throw new ConfigError(`\`githubApps[${idx}].${key}\` must be a non-empty string`);
			}
		}
	});
}

/** Throws a {@link ConfigError} naming the first thing wrong with the `ideas` block. */
function validateIdeas(ideas: IdeasConfig): void {
	const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
	const isObject = (value: unknown): boolean => typeof value === "object" && value !== null && !Array.isArray(value);
	if (!isObject(ideas)) throw new ConfigError("`ideas` must be an object: { states?, dir? (deprecated) }");
	if (ideas.dir !== undefined && !nonEmpty(ideas.dir))
		throw new ConfigError("`ideas.dir` must be the path of the notes folder, got an empty value");
	if (ideas.states !== undefined) {
		if (!isObject(ideas.states)) throw new ConfigError("`ideas.states` must be an object: { file? }");
		if (ideas.states.file !== undefined && !nonEmpty(ideas.states.file)) {
			throw new ConfigError("`ideas.states.file` must be a state name, got an empty value");
		}
	}
}

/** Throws a {@link ConfigError} naming the first thing wrong with the `dev` block. */
function validateDev(dev: DevConfig): void {
	const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
	if (dev.environment !== undefined && !nonEmpty(dev.environment)) {
		throw new ConfigError("`dev.environment` must be the name of a vault environment, got an empty value");
	}
	if (dev.tunnel !== undefined) {
		if (!nonEmpty(dev.tunnel.name)) throw new ConfigError("`dev.tunnel.name` must be a name, got an empty value");
		if (typeof dev.tunnel.hostname !== "string" || !HOSTNAME.test(dev.tunnel.hostname)) {
			throw new ConfigError(
				`\`dev.tunnel.hostname\` must be a hostname such as sentinel-dev.example.dev (no scheme or path), got ${JSON.stringify(dev.tunnel.hostname)}`
			);
		}
	}
	if (dev.port !== undefined && !(Number.isInteger(dev.port) && dev.port >= 1 && dev.port <= 65535)) {
		throw new ConfigError(`\`dev.port\` must be a port from 1 to 65535, got ${JSON.stringify(dev.port)}`);
	}
	if (
		dev.command !== undefined &&
		!(Array.isArray(dev.command) && dev.command.length > 0 && dev.command.every(nonEmpty))
	) {
		throw new ConfigError('`dev.command` must be the program and its arguments, e.g. ["pnpm", "run", "serve"]');
	}
	if (dev.serve !== undefined) {
		const { serve } = dev;
		if (!nonEmpty(serve.handler)) {
			throw new ConfigError("`dev.serve.handler` must be the path of the module that exports the handler");
		}
		if (serve.export !== undefined && !nonEmpty(serve.export)) {
			throw new ConfigError("`dev.serve.export` must be the name of the handler's export, got an empty value");
		}
		if (serve.required !== undefined && !(Array.isArray(serve.required) && serve.required.every(nonEmpty))) {
			throw new ConfigError("`dev.serve.required` must be a list of variable names");
		}
		if (serve.logging !== undefined && !(nonEmpty(serve.logging.tokenVar) && nonEmpty(serve.logging.datasetVar))) {
			throw new ConfigError("`dev.serve.logging` needs a `tokenVar` and a `datasetVar`, both variable names");
		}
	}
}

/** The values `repoValidation.docsCoverage` accepts. */
const DOCS_COVERAGE_MODES: readonly string[] = ["off", "warn", "required"];

/**
 * The environment a `credentials` provider reads: its own `environment` option when it has one, else the shared
 * `credentials.environment`, else `undefined`. The option lets each of several providers name its own (a 1Password
 * Environment and an AWS secret are not called the same thing) without the plugin storing the name.
 */
export function credentialsEnvironment(
	tuple: ResolvedTuple,
	config: { credentials?: CredentialsConfig }
): string | undefined {
	const own = tuple.options.environment;
	return typeof own === "string" && own.trim() !== "" ? own : config.credentials?.environment;
}

/** Validates a raw `holocron.config` and resolves its provider entries; throws `ConfigError` when `name` or `providers` is missing or an entry is malformed. */
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

	const docsCoverage = raw.repoValidation?.docsCoverage;
	if (docsCoverage !== undefined && !DOCS_COVERAGE_MODES.includes(docsCoverage)) {
		throw new ConfigError(
			`\`repoValidation.docsCoverage\` must be one of ${DOCS_COVERAGE_MODES.map((m) => `"${m}"`).join(", ")}, got ${JSON.stringify(docsCoverage)}`
		);
	}

	if (raw.credentials !== undefined) {
		const environment = raw.credentials.environment;
		if (typeof environment !== "string" || environment.trim() === "") {
			throw new ConfigError("`credentials.environment` must be the name of an environment, got an empty value");
		}
	}
	if (raw.dev !== undefined) validateDev(raw.dev);
	if (raw.githubApps !== undefined) validateGitHubApps(raw.githubApps);
	if (raw.ideas !== undefined) validateIdeas(raw.ideas);
	validateVariablesSync(raw.repo?.variables);
	validateSecretsDeploy(raw.repo?.secrets);
	const credentialsEntry = providers.credentials;
	if (credentialsEntry?.cardinality === "many") {
		for (const tuple of credentialsEntry.tuples) {
			const own = tuple.options.environment;
			if (own !== undefined && (typeof own !== "string" || own.trim() === "")) {
				throw new ConfigError(
					`the \`environment\` option of the \`${tuple.provider}\` credentials provider must be the name of an environment, got an empty value`
				);
			}
			if (credentialsEnvironment(tuple, raw) === undefined) {
				throw new ConfigError(
					`the \`${tuple.provider}\` credentials provider has no environment to read: give it an \`environment\` option or set \`credentials.environment\``
				);
			}
		}
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
		repoValidation: raw.repoValidation,
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
		credentials: raw.credentials,
		dev: raw.dev,
		githubApps: raw.githubApps,
		ideas: raw.ideas,
		log: raw.log,
		telemetry: raw.telemetry,
		eslint: raw.eslint,
	};
}
