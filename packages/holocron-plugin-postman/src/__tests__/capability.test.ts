import { describe, expect, it } from 'vitest'

import { PostmanTooling } from '../capabilities/tooling.js'
import { PostmanRestClient } from '../rest.js'

import { stubFetch } from './helpers.js'

function makeTooling(responses: Parameters<typeof stubFetch>[0]) {
  const { fetch, calls } = stubFetch(responses)
  const rest = new PostmanRestClient({ token: 'pmak-test', fetch })
  const tooling = new PostmanTooling(rest, {
    workspaceId: 'ws-id',
    specFile: 'apps/api/openapi.json',
    specName: 'Demo API',
    collectionName: 'Demo API',
  })
  return { tooling, calls }
}

describe('PostmanTooling — scaffold', () => {
  it('identifies as the postman provider with the tooling capability key', () => {
    const { tooling } = makeTooling([])
    expect(tooling.key).toBe('tooling')
    expect(tooling.providerName).toBe('postman')
  })

  it('throws when workspaceId is missing', () => {
    const rest = new PostmanRestClient({ token: 't' })
    expect(() => new PostmanTooling(rest, { workspaceId: '' })).toThrow(/workspaceId/)
  })

  // Real impls + tests land in the port commit. Tracked as it.todo so
  // they surface in test output but don't fail.
  it.todo('sync() reads the local spec file and pushes to Postman Spec Hub')
  it.todo('sync() finds-or-creates the collection by name')
  it.todo('sync() pushes each env file in envFiles')
  it.todo('doctor() probes /me and reports workspace access + spec/collection presence')

  it('sync() throws "not implemented" for the scaffold', async () => {
    const { tooling } = makeTooling([])
    await expect(tooling.sync()).rejects.toThrow(/not implemented/)
  })

  it('doctor() throws "not implemented" for the scaffold', async () => {
    const { tooling } = makeTooling([])
    await expect(tooling.doctor()).rejects.toThrow(/not implemented/)
  })
})
