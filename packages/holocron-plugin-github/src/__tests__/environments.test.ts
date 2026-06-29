import { describe, expect, it } from 'vitest'

import { GitHubEnvironments } from '../capabilities/environments.js'
import { GitHubRestClient } from '../rest.js'

import { stubFetch } from './helpers.js'

const REPO = 'theholocron/holocron'

function makeEnvs(responses: Parameters<typeof stubFetch>[0]) {
  const { fetch, calls } = stubFetch(responses)
  const rest = new GitHubRestClient({ token: 'pat', fetch })
  const envs = new GitHubEnvironments(rest, { repo: REPO })
  return { envs, calls }
}

describe('GitHubEnvironments', () => {
  it('listEnvironments returns name + wait_timer + reviewers', async () => {
    const { envs, calls } = makeEnvs([
      {
        status: 200,
        body: {
          total_count: 2,
          environments: [
            {
              name: 'staging',
              wait_timer: 0,
              prevent_self_review: false,
              protection_rules: [],
            },
            {
              name: 'production',
              wait_timer: 5,
              prevent_self_review: true,
              protection_rules: [
                {
                  type: 'required_reviewers',
                  reviewers: [
                    { type: 'User', reviewer: { id: 5769156 } },
                    { type: 'Team', reviewer: { id: 42 } },
                  ],
                },
              ],
            },
          ],
        },
      },
    ])

    const result = await envs.listEnvironments()
    expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/environments`)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: 'staging', waitTimer: 0, preventSelfReview: false })
    expect(result[1]).toMatchObject({
      name: 'production',
      waitTimer: 5,
      preventSelfReview: true,
      reviewers: [
        { type: 'User', id: 5769156 },
        { type: 'Team', id: 42 },
      ],
    })
  })

  it('upsertEnvironment PUTs with the reviewer numeric ids', async () => {
    const { envs, calls } = makeEnvs([{ status: 200, body: { name: 'production' } }])
    await envs.upsertEnvironment({
      name: 'production',
      reviewers: [{ type: 'User', id: 5769156 }],
      waitTimer: 0,
    })
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/environments/production`)
    expect(calls[0]?.body).toEqual({
      wait_timer: 0,
      reviewers: [{ type: 'User', id: 5769156 }],
    })
  })

  it('upsertEnvironment URL-encodes environment names with special chars', async () => {
    const { envs, calls } = makeEnvs([{ status: 200, body: {} }])
    await envs.upsertEnvironment({ name: 'feat/auth review' })
    expect(calls[0]?.url).toBe(
      `https://api.github.com/repos/${REPO}/environments/feat%2Fauth%20review`,
    )
  })

  it('upsertEnvironment sends only fields the caller provided (preserves API defaults)', async () => {
    const { envs, calls } = makeEnvs([{ status: 200, body: {} }])
    await envs.upsertEnvironment({ name: 'staging' })
    expect(calls[0]?.body).toEqual({})
  })

  it('deleteEnvironment → DELETE', async () => {
    const { envs, calls } = makeEnvs([{ status: 204 }])
    await envs.deleteEnvironment('staging')
    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/environments/staging`)
  })
})
