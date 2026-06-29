/**
 * `@theholocron/holocron-plugin-github` — entrypoint.
 *
 * Holocron loads a plugin by resolving its package and reading the
 * default export, which is a `Plugin` object declaring which
 * capabilities it implements. The factory for each capability
 * receives plugin-level options from `holocron.config.json` and
 * returns the bound implementation.
 *
 * Implementations are stubbed for the scaffold pass. Ports of
 * Rando's `gh-rest.ts` and `github-issues.ts` land next.
 */

import type {
  Auth,
  Ci,
  Environments,
  Issues,
  Secrets,
  Source,
} from '@theholocron/cli'

import { resolveToken, type ResolveTokenInput } from './auth.js'

export interface GitHubPluginOptions extends ResolveTokenInput {
  /** "owner/name" — e.g., "theholocron/holocron". Defaults to the working repo. */
  repo?: string
  /** Lifecycle slot → label name. Used by the `issues` capability. */
  labels?: { inProgress: string; inReview: string }
  /** Override base URL for tests. Defaults to https://api.github.com. */
  baseUrl?: string
  /** Override `fetch` for tests. Defaults to global `fetch`. */
  fetch?: typeof fetch
}

export interface PluginContext {
  options: GitHubPluginOptions
  token: string
  baseUrl: string
  fetch: typeof fetch
}

export function createContext(options: GitHubPluginOptions = {}): PluginContext {
  const token = resolveToken(options)
  return {
    options,
    token,
    baseUrl: options.baseUrl ?? 'https://api.github.com',
    fetch: options.fetch ?? fetch,
  }
}

// Capability factories — return the bound implementations. Stubs for
// now; ports land in subsequent commits.

export function source(_ctx: PluginContext): Source {
  throw new Error('not implemented (scaffold) — port from rando packages/cli/src/adapters/gh-rest.ts')
}

export function ci(_ctx: PluginContext): Ci {
  throw new Error('not implemented (scaffold)')
}

export function secrets(_ctx: PluginContext): Secrets {
  throw new Error('not implemented (scaffold) — needs libsodium sealed-box encryption')
}

export function environments(_ctx: PluginContext): Environments {
  throw new Error('not implemented (scaffold)')
}

export function issues(_ctx: PluginContext): Issues {
  throw new Error('not implemented (scaffold) — port from rando packages/cli/src/adapters/github-issues.ts')
}

// Optional: a barrel that the core CLI's plugin loader can call to
// instantiate everything at once.
export function createPlugin(options: GitHubPluginOptions = {}) {
  const ctx = createContext(options)
  return {
    name: '@theholocron/holocron-plugin-github',
    capabilities: {
      source: () => source(ctx),
      ci: () => ci(ctx),
      secrets: () => secrets(ctx),
      environments: () => environments(ctx),
      issues: () => issues(ctx),
    },
  }
}

export type { Auth }
export * from './auth.js'
