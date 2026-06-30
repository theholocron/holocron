/**
 * `auth` capability for Clerk — scaffold only.
 *
 * Methods are stubbed (`throw new Error('not implemented')`); real
 * implementations land in the next commit, ported from
 * rando-id/rando.id `adapters/clerk-cli.ts` + `domain/clerk.ts`.
 *
 * The Rando surface (whoami / ensureSvixApp / getSvixDashboardUrl /
 * createUser) is wider than the current holocron `Auth` interface,
 * which only declares `describe()` + optional `syncWebhook()`. The
 * impl pass will need to expand the core `Auth` interface in
 * `packages/cli/src/capabilities/index.ts` to fit — the same shape
 * adjustment we did for `Deployment` and `Storage`.
 */

import type { Auth, AuthDescription } from '@theholocron/cli'

import type { ClerkRestClient } from '../rest.js'

export type ClerkAuthOptions = Record<string, never>

export class ClerkAuth implements Auth {
  readonly key = 'auth' as const
  readonly providerName = 'clerk'

  constructor(
    private readonly _rest: ClerkRestClient,
    _opts: ClerkAuthOptions = {},
  ) {}

  async describe(): Promise<AuthDescription> {
    throw new Error('not implemented (scaffold) — port from rando packages/cli/src/adapters/clerk-cli.ts')
  }
}
