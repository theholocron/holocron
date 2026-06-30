import { describe, expect, it } from 'vitest'

import {
  runNpmPublishInitial,
  type PublishExecResult,
} from '../commands/npm-publish-initial.js'

function makeExec(responses: Record<string, PublishExecResult>) {
  const calls: Array<{ cmd: string; args: string[] }> = []
  const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
    calls.push({ cmd, args: [...args] })
    return (
      responses[cmd] ?? {
        exitCode: 0,
        stdout: '',
        stderr: '',
      }
    )
  }
  return { exec, calls }
}

const baseEnv: NodeJS.ProcessEnv = {}

describe('runNpmPublishInitial', () => {
  it('verifies npm auth via `npm whoami` before publishing', async () => {
    const { exec, calls } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton\n', stderr: '' },
      pnpm: { exitCode: 0, stdout: '', stderr: '' },
    })
    const report = await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: baseEnv,
      print: () => {},
      exec,
    })
    expect(report.status).toBe('ok')
    expect(calls[0]?.cmd).toBe('npm')
    expect(calls[0]?.args).toEqual(['whoami'])
  })

  it('fails fast when npm whoami exits non-zero', async () => {
    const { exec, calls } = makeExec({
      npm: { exitCode: 1, stdout: '', stderr: 'ENEEDAUTH' },
    })
    const report = await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: baseEnv,
      print: () => {},
      exec,
    })
    expect(report.status).toBe('fail')
    expect(report.message).toContain('npm login')
    expect(calls).toHaveLength(1) // didn't even attempt publish
  })

  it('runs the pnpm publish with the right filters + flags', async () => {
    const { exec, calls } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
      pnpm: { exitCode: 0, stdout: '', stderr: '' },
    })
    await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: baseEnv,
      print: () => {},
      exec,
    })
    expect(calls[1]?.cmd).toBe('pnpm')
    expect(calls[1]?.args).toEqual([
      '-r',
      '--filter=./packages/*',
      '--filter=!@theholocron/cli-utils',
      'publish',
      '--access',
      'public',
      '--no-git-checks',
      '--tag',
      'alpha',
    ])
  })

  it('honors a custom tag', async () => {
    const { exec, calls } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
      pnpm: { exitCode: 0, stdout: '', stderr: '' },
    })
    await runNpmPublishInitial({
      cwd: '/tmp/test',
      tag: 'next',
      env: baseEnv,
      print: () => {},
      exec,
    })
    expect(calls[1]?.args).toContain('next')
  })

  it('returns fail with the captured stderr when publish exits non-zero', async () => {
    const { exec } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
      pnpm: { exitCode: 1, stdout: '', stderr: 'EPUBLISHCONFLICT' },
    })
    const report = await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: baseEnv,
      print: () => {},
      exec,
    })
    expect(report.status).toBe('fail')
    expect(report.message).toContain('EPUBLISHCONFLICT')
  })

  it('dry-run prints "would run" + skips the publish call', async () => {
    const lines: string[] = []
    const { exec, calls } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
    })
    const report = await runNpmPublishInitial({
      cwd: '/tmp/test',
      dryRun: true,
      env: baseEnv,
      print: (l) => lines.push(l),
      exec,
    })
    expect(report.status).toBe('dry-run')
    expect(calls).toHaveLength(1) // only whoami
    expect(lines.some((l) => l.includes('would run'))).toBe(true)
  })

  it('includes the trusted-publisher setup URLs in next-steps output', async () => {
    const lines: string[] = []
    const { exec } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
      pnpm: { exitCode: 0, stdout: '', stderr: '' },
    })
    await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: baseEnv,
      print: (l) => lines.push(l),
      exec,
    })
    const joined = lines.join('\n')
    expect(joined).toContain('npmjs.com/package/@theholocron/cli/access')
    expect(joined).toContain('npmjs.com/package/@theholocron/holocron-plugin-github/access')
    expect(joined).toContain('Publisher: GitHub Actions')
    expect(joined).toContain('Workflow: release.yml')
  })

  it('prints a token-revoke reminder when NPM_TOKEN is detected in env', async () => {
    const lines: string[] = []
    const { exec } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
      pnpm: { exitCode: 0, stdout: '', stderr: '' },
    })
    await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: { NPM_TOKEN: 'npm_xxx' },
      print: (l) => lines.push(l),
      exec,
    })
    const joined = lines.join('\n')
    expect(joined).toContain('Revoke it now')
    expect(joined).toContain('npmjs.com/settings/~/tokens')
  })

  it('omits the token-revoke reminder when no NPM_TOKEN was set', async () => {
    const lines: string[] = []
    const { exec } = makeExec({
      npm: { exitCode: 0, stdout: 'iamnewton', stderr: '' },
      pnpm: { exitCode: 0, stdout: '', stderr: '' },
    })
    await runNpmPublishInitial({
      cwd: '/tmp/test',
      env: baseEnv,
      print: (l) => lines.push(l),
      exec,
    })
    const joined = lines.join('\n')
    expect(joined).not.toContain('Revoke it now')
  })
})
