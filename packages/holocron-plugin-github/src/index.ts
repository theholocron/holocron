/**
 * `@theholocron/holocron-plugin-github` — entrypoint.
 *
 * Holocron loads a plugin by resolving its package and reading the
 * default export, which is a `Plugin` object declaring which
 * capabilities it implements. The factory for each capability
 * receives plugin-level options from `holocron.config.json` and
 * returns the bound implementation.
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
import { GitHubEnvironments } from './capabilities/environments.js'
import { GitHubSecrets } from './capabilities/secrets.js'
import { GitHubSource } from './capabilities/source.js'
import { GitHubRestClient } from './rest.js'

export interface GitHubPluginOptions extends ResolveTokenInput {
  /** "owner/name" — e.g., "theholocron/holocron". Required. */
  repo: string
  /** Absolute path to the working repo root. Used by `source`'s
   * workflow-file methods. Defaults to `process.cwd()`. */
  repoRoot?: string
  /** Lifecycle slot → label name. Used by the `issues` capability. */
  labels?: { inProgress: string; inReview: string }
  /** Override base URL for tests. Defaults to https://api.github.com. */
  baseUrl?: string
  /** Override `fetch` for tests. Defaults to global `fetch`. */
  fetch?: typeof fetch
}

export interface PluginContext {
  options: GitHubPluginOptions
  rest: GitHubRestClient
  repo: string
  repoRoot: string
}

export function createContext(options: GitHubPluginOptions): PluginContext {
  const token = resolveToken(options)
  const rest = new GitHubRestClient({
    token,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
  })
  return {
    options,
    rest,
    repo: options.repo,
    repoRoot: options.repoRoot ?? process.cwd(),
  }
}

// ── Capability factories ──────────────────────────────────────────────

export function source(ctx: PluginContext): Source {
  return new GitHubSource(ctx.rest, { repo: ctx.repo, repoRoot: ctx.repoRoot })
}

export function secrets(ctx: PluginContext): Secrets {
  return new GitHubSecrets(ctx.rest, { repo: ctx.repo })
}

export function environments(ctx: PluginContext): Environments {
  return new GitHubEnvironments(ctx.rest, { repo: ctx.repo })
}

export function ci(_ctx: PluginContext): Ci {
  throw new Error('ci capability not yet implemented — see phase 2b')
}

export function issues(_ctx: PluginContext): Issues {
  throw new Error('issues capability not yet implemented — see phase 2b (port from rando github-issues.ts)')
}

// ── Plugin barrel for the core loader ─────────────────────────────────

export function createPlugin(options: GitHubPluginOptions) {
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

// ── Public re-exports ─────────────────────────────────────────────────

export type { Auth }
export * from './auth.js'
export { GitHubRestClient } from './rest.js'
export { encryptSecret } from './sodium.js'
export { GitHubSource } from './capabilities/source.js'
export { GitHubSecrets } from './capabilities/secrets.js'
export { GitHubEnvironments } from './capabilities/environments.js'
