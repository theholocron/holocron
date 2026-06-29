import { ProviderApiError } from '@theholocron/cli'
import { describe, expect, it } from 'vitest'

import { GitHubRestClient } from '../rest.js'

import { stubFetch } from './helpers.js'

const TOKEN = 'gh_pat_test'

describe('GitHubRestClient', () => {
  it('sends the bearer token and api-version headers on GET', async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: { login: 'iamnewton' } }])
    const client = new GitHubRestClient({ token: TOKEN, fetch })
    const result = await client.request<{ login: string }>('/user')
    expect(result).toEqual({ login: 'iamnewton' })
    expect(calls[0]?.url).toBe('https://api.github.com/user')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]?.headers['x-github-api-version']).toBe('2022-11-28')
    expect(calls[0]?.headers.accept).toBe('application/vnd.github+json')
  })

  it('serializes a body on POST and sets content-type', async () => {
    const { fetch, calls } = stubFetch([{ status: 201, body: { id: 1 } }])
    const client = new GitHubRestClient({ token: TOKEN, fetch })
    await client.request('/repos/x/y/issues', { method: 'POST', body: { title: 'hi' } })
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.body).toEqual({ title: 'hi' })
    expect(calls[0]?.headers['content-type']).toBe('application/json')
  })

  it('returns undefined for 204 responses', async () => {
    const { fetch } = stubFetch([{ status: 204 }])
    const client = new GitHubRestClient({ token: TOKEN, fetch })
    const result = await client.request('/repos/x/y/secrets/PROD', { method: 'PUT' })
    expect(result).toBeUndefined()
  })

  it('returns undefined when expectNoContent is set even on 200', async () => {
    const { fetch } = stubFetch([{ status: 200 }])
    const client = new GitHubRestClient({ token: TOKEN, fetch })
    const result = await client.request('/repos/x/y/something', { expectNoContent: true })
    expect(result).toBeUndefined()
  })

  it('throws ProviderApiError on non-2xx with status + details', async () => {
    const { fetch } = stubFetch([{ status: 401, text: 'bad creds' }])
    const client = new GitHubRestClient({ token: TOKEN, fetch })
    try {
      await client.request('/user')
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderApiError)
      const pae = err as ProviderApiError
      expect(pae.status).toBe(401)
      expect(pae.details).toBe('bad creds')
      expect(pae.message).toContain('401')
    }
  })

  it('strips trailing slashes from baseUrl override', async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: {} }])
    const client = new GitHubRestClient({
      token: TOKEN,
      fetch,
      baseUrl: 'https://example.test/api/',
    })
    await client.request('/foo')
    expect(calls[0]?.url).toBe('https://example.test/api/foo')
  })
})
