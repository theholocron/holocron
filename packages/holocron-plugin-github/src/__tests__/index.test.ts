/**
 * End-to-end wiring: createPlugin() should produce instantiable
 * implementations of every capability it declares. Stub capabilities
 * (ci, issues) throw "not implemented"; real ones return instances
 * that pass instanceof checks.
 */

import { describe, expect, it } from 'vitest'

import {
  AuthError,
  GitHubEnvironments,
  GitHubSecrets,
  GitHubSource,
  createPlugin,
} from '../index.js'

describe('createPlugin', () => {
  it('throws AuthError when no token is found', () => {
    expect(() =>
      createPlugin({ repo: 'theholocron/holocron', env: {} }),
    ).toThrow(AuthError)
  })

  it('wires the three implemented capabilities', () => {
    const plugin = createPlugin({
      repo: 'theholocron/holocron',
      cliToken: 'pat-test',
    })

    expect(plugin.name).toBe('@theholocron/holocron-plugin-github')
    expect(plugin.capabilities.source()).toBeInstanceOf(GitHubSource)
    expect(plugin.capabilities.secrets()).toBeInstanceOf(GitHubSecrets)
    expect(plugin.capabilities.environments()).toBeInstanceOf(GitHubEnvironments)
  })

  it('leaves ci + issues throwing with helpful messages until phase 2b', () => {
    const plugin = createPlugin({
      repo: 'theholocron/holocron',
      cliToken: 'pat-test',
    })

    expect(() => plugin.capabilities.ci()).toThrow(/not yet implemented/)
    expect(() => plugin.capabilities.issues()).toThrow(/github-issues\.ts/)
  })

  it('passes baseUrl + fetch through to the REST client', async () => {
    let captured: { url: string; method: string } | null = null
    const fakeFetch: typeof fetch = async (input, init) => {
      captured = {
        url: typeof input === 'string' ? input : input.toString(),
        method: (init?.method ?? 'GET').toUpperCase(),
      }
      return new Response('{"login":"x"}', { status: 200 })
    }

    const plugin = createPlugin({
      repo: 'theholocron/holocron',
      cliToken: 'pat-test',
      baseUrl: 'https://test.invalid',
      fetch: fakeFetch,
    })
    await plugin.capabilities.source().whoami()
    expect(captured).toEqual({ url: 'https://test.invalid/user', method: 'GET' })
  })
})
