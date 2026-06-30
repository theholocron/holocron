import { describe, expect, it } from 'vitest'

import { ClerkAuth } from '../capabilities/auth.js'
import { ClerkRestClient } from '../rest.js'

import { stubFetch } from './helpers.js'

function makeAuth(responses: Parameters<typeof stubFetch>[0]) {
  const { fetch, calls } = stubFetch(responses)
  const rest = new ClerkRestClient({ token: 'sk_test_pat', fetch })
  const auth = new ClerkAuth(rest)
  return { auth, calls }
}

describe('ClerkAuth — scaffold', () => {
  it('identifies as the clerk provider with the auth capability key', () => {
    const { auth } = makeAuth([])
    expect(auth.key).toBe('auth')
    expect(auth.providerName).toBe('clerk')
  })

  // Stub methods — real impls + tests land in the next commit. Tracked as
  // `it.todo(...)` so they surface in the test output but don't fail.
  it.todo('describe() returns the env-key list Clerk apps need')
  it.todo('whoami() probes /users/count and returns total_count')
  it.todo('ensureSvixApp() POSTs /webhooks/svix and handles already-exists idempotently')
  it.todo('getSvixDashboardUrl() POSTs /webhooks/svix_url and extracts the url field')
  it.todo('createUser() POSTs /users with the right field shape')

  it('describe() throws "not implemented" for the scaffold', async () => {
    const { auth } = makeAuth([])
    await expect(auth.describe()).rejects.toThrow(/not implemented/)
  })
})
