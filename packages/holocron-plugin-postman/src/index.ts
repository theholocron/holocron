/**
 * `@theholocron/holocron-plugin-postman` — entrypoint.
 *
 * Implements the `tooling` capability against Postman's REST API.
 * See README for auth + config docs.
 */

import type { Tooling } from '@theholocron/cli'

import { resolveToken, type ResolveTokenInput } from './auth.js'
import {
  PostmanTooling,
  type PostmanToolingOptions,
} from './capabilities/tooling.js'
import { PostmanRestClient } from './rest.js'

export interface PostmanPluginOptions extends ResolveTokenInput, PostmanToolingOptions {
  /** Working repo root. Used to resolve relative paths in specFile/envFiles. Defaults to process.cwd(). */
  repoRoot?: string
  /** Override base URL for tests. */
  baseUrl?: string
  /** Override `fetch` for tests. */
  fetch?: typeof fetch
}

export interface PluginContext {
  options: PostmanPluginOptions
  rest: PostmanRestClient
}

export function createContext(options: PostmanPluginOptions): PluginContext {
  if (!options.workspaceId) {
    throw new Error('@theholocron/holocron-plugin-postman requires `workspaceId` in options')
  }
  const token = resolveToken(options)
  const restOpts: ConstructorParameters<typeof PostmanRestClient>[0] = { token }
  if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl
  if (options.fetch !== undefined) restOpts.fetch = options.fetch
  return {
    options,
    rest: new PostmanRestClient(restOpts),
  }
}

export function tooling(ctx: PluginContext): Tooling {
  const opts: PostmanToolingOptions = { workspaceId: ctx.options.workspaceId }
  if (ctx.options.specFile !== undefined) opts.specFile = ctx.options.specFile
  if (ctx.options.specName !== undefined) opts.specName = ctx.options.specName
  if (ctx.options.collectionName !== undefined) opts.collectionName = ctx.options.collectionName
  if (ctx.options.envFiles !== undefined) opts.envFiles = ctx.options.envFiles
  if (ctx.options.repoRoot !== undefined) opts.repoRoot = ctx.options.repoRoot
  return new PostmanTooling(ctx.rest, opts)
}

export function createPlugin(options: PostmanPluginOptions) {
  const ctx = createContext(options)
  return {
    name: '@theholocron/holocron-plugin-postman',
    capabilities: {
      tooling: () => tooling(ctx),
    },
  }
}

// ── Public re-exports ────────────────────────────────────────────────

export * from './auth.js'
export { PostmanPlanLimitError, detectPlanLimit } from './errors.js'
export { PostmanRestClient } from './rest.js'
export { PostmanTooling } from './capabilities/tooling.js'
