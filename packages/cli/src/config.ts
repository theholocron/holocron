import type { CapabilityKey } from './capabilities/index.js'

/**
 * ESLint-style provider entry — short form (`"github"`) OR tuple form
 * (`["github", { ...options }]`).
 */
export type ProviderEntry = string | [provider: string, options: Record<string, unknown>]

export type ProvidersConfig = Partial<Record<CapabilityKey, ProviderEntry>>

export interface HolocronConfig {
  /** Project metadata. */
  project: { name: string; description?: string }
  /** Maps each capability to a provider plugin. */
  providers: ProvidersConfig
  /** Apps inside a monorepo project (each has its own deploy / env contract). */
  apps?: Array<{ name: string; path: string; kind?: string }>
  /** Doctor check selection (built-in keys; plugins can register more). */
  doctor?: { checks?: string[] }
}

/**
 * Resolve `"github"` → `@theholocron/holocron-plugin-github`.
 * Also accepts fully-qualified package names (`@scope/pkg`).
 */
export function resolvePluginPackage(provider: string): string {
  if (provider.startsWith('@') || provider.includes('/')) return provider
  return `@theholocron/holocron-plugin-${provider}`
}

export function normalizeEntry(entry: ProviderEntry): { provider: string; options: Record<string, unknown> } {
  if (typeof entry === 'string') return { provider: entry, options: {} }
  const [provider, options] = entry
  return { provider, options }
}
