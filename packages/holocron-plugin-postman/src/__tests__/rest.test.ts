import { ProviderApiError } from '@theholocron/cli'
import { describe, expect, it, vi } from 'vitest'

import { PostmanRestClient } from '../rest.js'

import { stubFetch } from './helpers.js'

const TOKEN = 'PMAK-xxx'

describe('PostmanRestClient', () => {
  it('sends x-api-key + accept headers on every request', async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: { user: { id: 1 } } }])
    const client = new PostmanRestClient({ token: TOKEN, fetch })
    await client.request('/me')
    expect(calls[0]?.url).toBe('https://api.getpostman.com/me')
    expect(calls[0]?.headers['x-api-key']).toBe(TOKEN)
    expect(calls[0]?.headers.accept).toBe('application/json')
  })

  it('serializes body on writes and sets content-type', async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: { collection: { uid: 'x' } } }])
    const client = new PostmanRestClient({ token: TOKEN, fetch })
    await client.request('/collections', { method: 'POST', body: { collection: { info: {} } } })
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.body).toEqual({ collection: { info: {} } })
    expect(calls[0]?.headers['content-type']).toBe('application/json')
  })

  it('appends query params when supplied', async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: { workspaces: [] } }])
    const client = new PostmanRestClient({ token: TOKEN, fetch })
    await client.request('/workspaces', { query: { type: 'team' } })
    expect(calls[0]?.url).toBe('https://api.getpostman.com/workspaces?type=team')
  })

  it('returns undefined on 204', async () => {
    const { fetch } = stubFetch([{ status: 204 }])
    const client = new PostmanRestClient({ token: TOKEN, fetch })
    expect(await client.request('/collections/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('throws ProviderApiError with status + path on non-2xx', async () => {
    const { fetch } = stubFetch([{ status: 403, text: 'AuthorizationError' }])
    const client = new PostmanRestClient({ token: TOKEN, fetch })
    try {
      await client.request('/me')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderApiError)
      const pae = err as ProviderApiError
      expect(pae.status).toBe(403)
      expect(pae.message).toContain('/me')
    }
  })

  it('wraps transport-level failures with status 0', async () => {
    const failingFetch: typeof fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const client = new PostmanRestClient({ token: TOKEN, fetch: failingFetch })
    try {
      await client.request('/me')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderApiError)
      expect((err as ProviderApiError).status).toBe(0)
      expect((err as ProviderApiError).message).toContain('Postman GET /me failed')
    }
  })
})
