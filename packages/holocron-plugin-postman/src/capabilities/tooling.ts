/**
 * `tooling` capability for Postman — scaffold only.
 *
 * `sync()` and `doctor()` are stubbed; real implementations land in
 * the next commit, ported from rando-id/rando.id `adapters/postman.ts`.
 *
 * The Postman-specific surface (workspaces, collections, environments,
 * Spec Hub, API entities) lives as additional methods on this class
 * rather than on the shared `Tooling` interface — those operations
 * are too Postman-shaped for a generic tooling contract.
 */

import type { Tooling, ToolingDoctorReport } from '@theholocron/cli'

import type { PostmanRestClient } from '../rest.js'

export interface PostmanToolingOptions {
  workspaceId: string
  /** Local OpenAPI JSON path (relative to repoRoot). */
  specFile?: string
  /** Display name in Postman. Defaults to the repo / project name. */
  specName?: string
  /** Collection name to import the spec as. Defaults to specName. */
  collectionName?: string
  /** Local Postman environment JSON files to push. */
  envFiles?: string[]
}

export class PostmanTooling implements Tooling {
  readonly key = 'tooling' as const
  readonly providerName = 'postman'

  constructor(
    private readonly _rest: PostmanRestClient,
    private readonly _opts: PostmanToolingOptions,
  ) {
    if (!_opts.workspaceId) {
      throw new Error('PostmanTooling requires `workspaceId` in options')
    }
  }

  async sync(): Promise<void> {
    throw new Error(
      'not implemented (scaffold) — port from rando packages/cli/src/adapters/postman.ts',
    )
  }

  async doctor(): Promise<ToolingDoctorReport> {
    throw new Error('not implemented (scaffold)')
  }
}
