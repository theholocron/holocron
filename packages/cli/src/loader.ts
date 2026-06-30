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
 * Loader keeps NO knowledge of vendor tokens. Each plugin reads its
 * own env vars (`HOLOCRON_GH_TOKEN`, `HOLOCRON_VERCEL_TOKEN`, etc.)
 * inside its `createPlugin`. That keeps the loader vendor-agnostic
 * and the auth story per-plugin explicit.
 *
 * `importer` is injectable so tests don't need real network or
 * sibling packages installed.
 */

import type {
  CapabilityKey,
  CardinalityFor,
  ResolvedCapability,
} from './capabilities/index.js'
import { CARDINALITY } from './capabilities/index.js'
import type { ResolvedHolocronConfig, ResolvedTuple } from './config.js'

/**
 * Per-invocation context every plugin receives, on top of its own
 * config-time options. Kept intentionally narrow.
 */
export interface RuntimeContext {
  /** "owner/name" — the repo this invocation is operating on. */
  repo?: string
  /** Absolute path to the working repo root. */
  repoRoot: string
}

/**
 * The shape every plugin's default-or-named export must satisfy:
 * `createPlugin(opts)` returns an object with capability factories.
 */
export interface LoadedPlugin {
  name: string
  capabilities: Partial<{
    [K in CapabilityKey]: () => unknown
  }>
}

export interface PluginModule {
  createPlugin: (opts: Record<string, unknown>) => LoadedPlugin
}

export type PluginImporter = (packageName: string) => Promise<PluginModule>

export class LoaderError extends Error {
  override name = 'LoaderError'
}

export class PluginLoader {
  private readonly registry = new Map<CapabilityKey, unknown>()

  constructor(
    private readonly config: ResolvedHolocronConfig,
    private readonly context: RuntimeContext,
    private readonly importer: PluginImporter = defaultImporter,
  ) {}

  /** Imports every configured plugin and builds the capability registry. */
  async load(): Promise<void> {
    const entries = Object.entries(this.config.providers) as Array<[
      CapabilityKey,
      ResolvedHolocronConfig['providers'][CapabilityKey],
    ]>

    for (const [key, entry] of entries) {
      if (!entry) continue
      if (entry.cardinality === 'single') {
        this.registry.set(key, await this.loadOne(key, entry.tuple))
      } else {
        const impls = []
        for (const tuple of entry.tuples) {
          impls.push(await this.loadOne(key, tuple))
        }
        this.registry.set(key, impls)
      }
    }
  }

  /**
   * Type-safe lookup. Single-cardinality keys return one impl;
   * many-cardinality keys return an array. `ResolvedCapability<K>`
   * encodes the split via the `CARDINALITY` map.
   */
  get<K extends CapabilityKey>(key: K): ResolvedCapability<K> {
    const impl = this.registry.get(key)
    if (impl === undefined) {
      throw new LoaderError(
        `capability \`${key}\` is not loaded — is it declared in holocron.config.json?`,
      )
    }
    return impl as ResolvedCapability<K>
  }

  /** Whether a capability has been loaded. */
  has<K extends CapabilityKey>(key: K): boolean {
    return this.registry.has(key)
  }

  /** All capability keys currently loaded. Useful for the doctor command. */
  loadedKeys(): CapabilityKey[] {
    return Array.from(this.registry.keys())
  }

  /** Internal — invoke a plugin's capability factory and return the impl. */
  private async loadOne(key: CapabilityKey, tuple: ResolvedTuple): Promise<unknown> {
    const module = await this.importer(tuple.packageName).catch((err: unknown) => {
      throw new LoaderError(
        `failed to import \`${tuple.packageName}\` for capability \`${key}\`: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
    if (typeof module.createPlugin !== 'function') {
      throw new LoaderError(
        `\`${tuple.packageName}\` does not export \`createPlugin(options)\``,
      )
    }
    const plugin = module.createPlugin({ ...this.context, ...tuple.options })
    const factory = plugin.capabilities[key]
    if (typeof factory !== 'function') {
      throw new LoaderError(
        `\`${tuple.packageName}\` does not implement the \`${key}\` capability`,
      )
    }
    return factory()
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Default importer — native dynamic import. */
const defaultImporter: PluginImporter = async (pkg) => {
  return (await import(pkg)) as PluginModule
}

/** Convenience re-export so callers can compute counts without importing CARDINALITY directly. */
export function cardinalityOf<K extends CapabilityKey>(key: K): CardinalityFor<K> {
  return CARDINALITY[key]
}
