/**
 * `PluginLoader` — loads provider plugins per the resolved config and
 * builds a typed capability registry the runtime can query.
 *
 * Flow:
 *   1. Walk `config.providers[*]` from `resolveConfig()`
 *   2. For each entry, dynamic-import the resolved package name
 *      (`@theholocron/holocron-plugin-<provider>` by default)
 *   3. Call the package's exported `createPlugin(options)` to get a
 *      plugin object whose `capabilities` map holds factories
 *   4. Invoke the matching capability factory and stash the impl in
 *      the registry — single-cardinality entries hold one impl,
 *      many-cardinality entries hold an array
 *
 * A package may instead export a capability config (see
 * `CapabilityConfigPackage` in config.ts). The loader detects the shape
 * at import time and re-resolves to the underlying plugin, merging the
 * preset options with any per-project overrides from the config file
 * (project options win, mirroring ESLint's `extends` precedence).
 *
 * Loader keeps NO knowledge of vendor tokens. Each plugin reads its
 * own env vars (`HOLOCRON_ADMIN_TOKEN`, `HOLOCRON_VERCEL_TOKEN`, etc.)
 * inside its `createPlugin`. That keeps the loader vendor-agnostic
 * and the auth story per-plugin explicit.
 *
 * `importer` is injectable so tests don't need real network or
 * sibling packages installed.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { errorMessage } from "@theholocron/misc-utils";

import {
	type CapabilityConfigPackage,
	type ResolvedHolocronConfig,
	type ResolvedTuple,
	resolvePluginPackage,
} from "../../config/config/index.js";
import {
	type CapabilityKey,
	CARDINALITY,
	type CardinalityFor,
	type ResolvedCapability,
} from "../capabilities/index.js";
import type { PluginProbes } from "../probe/index.js";
import type { PluginImporter, PluginLoadFailure, PluginModule, RuntimeContext } from "./loader.type.js";

export class LoaderError extends Error {
	override name = "LoaderError";
}

export class PluginLoader {
	private readonly registry = new Map<CapabilityKey, unknown>();
	private readonly failures: PluginLoadFailure[] = [];
	/** The probes of each provider that was imported, by provider name (`sentry`). */
	private readonly probeSets = new Map<string, PluginProbes>();

	constructor(
		private readonly config: ResolvedHolocronConfig,
		private readonly context: RuntimeContext,
		private readonly importer: PluginImporter = defaultImporter
	) {}

	/**
	 * Imports every configured plugin and builds the capability registry.
	 *
	 * Never throws for a single plugin's failure — a missing vendor token,
	 * an uninstalled package, or an unimplemented capability records a
	 * {@link PluginLoadFailure} and the load continues. This is the
	 * "soft-skip over hard-fail" contract: a command that needs a
	 * capability learns it is absent via `has()` / `get()` (which
	 * re-surfaces the original error), and orchestrators report the skip
	 * in their summary. Inspect {@link loadFailures} for the full list.
	 */
	async load(): Promise<void> {
		const entries = Object.entries(this.config.providers) as Array<
			[CapabilityKey, ResolvedHolocronConfig["providers"][CapabilityKey]]
		>;

		for (const [key, entry] of entries) {
			if (!entry) continue;
			if (entry.cardinality === "single") {
				try {
					this.registry.set(key, await this.loadOne(key, entry.tuple));
				} catch (err) {
					this.recordFailure(key, entry.tuple, err);
				}
			} else {
				const impls: unknown[] = [];
				for (const tuple of entry.tuples) {
					try {
						impls.push(await this.loadOne(key, tuple));
					} catch (err) {
						this.recordFailure(key, tuple, err);
					}
				}
				if (impls.length > 0) this.registry.set(key, impls);
			}
		}
	}

	private recordFailure(key: CapabilityKey, tuple: ResolvedTuple, err: unknown): void {
		this.failures.push({
			key,
			provider: tuple.provider,
			packageName: tuple.packageName,
			error: err instanceof Error ? err : new Error(String(err)),
		});
	}

	/** Providers that failed to load during {@link load}. Empty on a clean load. */
	loadFailures(): readonly PluginLoadFailure[] {
		return this.failures;
	}

	/**
	 * Type-safe lookup. Single-cardinality keys return one impl;
	 * many-cardinality keys return an array. `ResolvedCapability<K>`
	 * encodes the split via the `CARDINALITY` map.
	 */
	get<K extends CapabilityKey>(key: K): ResolvedCapability<K> {
		const impl = this.registry.get(key);
		if (impl === undefined) {
			// If the plugin was configured but failed to load, re-surface the
			// original error (e.g. `AuthError: no Vercel token found`) rather
			// than a generic "not loaded" — single-capability commands then
			// give the operator an actionable message.
			const failure = this.failures.find((f) => f.key === key);
			if (failure) throw failure.error;
			throw new LoaderError(`capability \`${key}\` is not loaded — is it declared in holocron.config.json?`);
		}
		return impl as ResolvedCapability<K>;
	}

	/** Whether a capability has been loaded. */
	has<K extends CapabilityKey>(key: K): boolean {
		return this.registry.has(key);
	}

	/** All capability keys currently loaded. Useful for the doctor command. */
	/** The probes each loaded provider offers, by provider name. Empty for a provider that offers none. */
	probes(): ReadonlyMap<string, PluginProbes> {
		return this.probeSets;
	}

	loadedKeys(): CapabilityKey[] {
		return Array.from(this.registry.keys());
	}

	/** Internal — invoke a plugin's capability factory and return the impl. */
	private async loadOne(key: CapabilityKey, tuple: ResolvedTuple): Promise<unknown> {
		const mod = await this.importer(tuple.packageName).catch((err: unknown) => {
			throw new LoaderError(
				`failed to import \`${tuple.packageName}\` for capability \`${key}\`: ${errorMessage(err)}`
			);
		});

		// Plugin package: exports createPlugin(opts) → { capabilities }
		if (isPluginModule(mod)) {
			// Resolve the effective token for this specific plugin.
			// cliTokens[provider] wins over the bare cliToken fallback.
			const effectiveToken = this.context.cliTokens?.[tuple.provider] ?? this.context.cliToken;

			// Precedence (later wins): project-level defaults from config →
			// runtime context (CLI flags: --repo, --token) → per-plugin
			// resolved token → tuple options (per-plugin overrides in config).
			// cliTokens is explicitly cleared so the map never reaches plugins.
			const plugin = mod.createPlugin({
				...this.projectDefaults(),
				...this.context,
				...(effectiveToken !== undefined ? { cliToken: effectiveToken } : {}),
				cliTokens: undefined,
				...tuple.options,
			});
			if (plugin.probes && Object.keys(plugin.probes).length > 0)
				this.probeSets.set(tuple.provider, plugin.probes);
			const factory = plugin.capabilities[key];
			if (typeof factory !== "function") {
				throw new LoaderError(`\`${tuple.packageName}\` does not implement the \`${key}\` capability`);
			}
			return factory();
		}

		// Capability config package: default export is { provider, options? }.
		// Re-resolve to the underlying plugin; preset options are the base,
		// per-project tuple options override them (ESLint extends precedence).
		if (isCapabilityConfigModule(mod)) {
			const cap = (mod as { default: CapabilityConfigPackage }).default;
			return this.loadOne(key, {
				provider: cap.provider,
				packageName: resolvePluginPackage(cap.provider),
				options: { ...cap.options, ...tuple.options },
			});
		}

		throw new LoaderError(
			`\`${tuple.packageName}\` does not export \`createPlugin(options)\` or a capability config ({ provider, options? })`
		);
	}

	/**
	 * Project-level defaults that get merged into every plugin's options
	 * unless overridden by the CLI context or per-plugin tuple options.
	 * See `docs/wiki/specifications/tech-setup-and-config.spec.md` §Design.
	 */
	private projectDefaults(): Partial<RuntimeContext> {
		const defaults: Partial<RuntimeContext> = {};
		if (this.config.repo?.name) defaults.repo = this.config.repo.name;
		return defaults;
	}
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Default importer — resolves from cwd first so the global CLI finds project plugins. */
const defaultImporter: PluginImporter = async (pkg) => {
	try {
		const localRequire = createRequire(process.cwd() + "/");
		const resolved = localRequire.resolve(pkg);
		return import(pathToFileURL(resolved).href);
	} catch {
		return import(pkg);
	}
};

function isPluginModule(mod: unknown): mod is PluginModule {
	return typeof (mod as PluginModule).createPlugin === "function";
}

function isCapabilityConfigModule(mod: unknown): mod is { default: CapabilityConfigPackage } {
	const def = (mod as { default?: unknown }).default;
	return typeof (def as CapabilityConfigPackage)?.provider === "string";
}

/** Convenience re-export so callers can compute counts without importing CARDINALITY directly. */
export function cardinalityOf<K extends CapabilityKey>(key: K): CardinalityFor<K> {
	return CARDINALITY[key];
}
