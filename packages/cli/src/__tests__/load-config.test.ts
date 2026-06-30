import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConfigError } from '../config.js'
import { ConfigFileError, loadConfig } from '../load-config.js'

describe('loadConfig', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'holocron-cfg-'))
  })
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  it('reads + resolves a valid holocron.config.json', async () => {
    await writeFile(
      join(cwd, 'holocron.config.json'),
      JSON.stringify({
        project: { name: 'demo' },
        providers: { vault: '1password', source: 'github' },
      }),
    )
    const { resolved, filepath } = await loadConfig(cwd)
    expect(filepath).toBe(join(cwd, 'holocron.config.json'))
    expect(resolved.project.name).toBe('demo')
    expect(resolved.providers.vault?.cardinality).toBe('single')
  })

  it('errors clearly when no holocron.config.* exists in the directory', async () => {
    await expect(loadConfig(cwd)).rejects.toBeInstanceOf(ConfigFileError)
    await expect(loadConfig(cwd)).rejects.toThrow(/no holocron\.config/)
  })

  it('errors with a clear message when the JSON is malformed', async () => {
    await writeFile(join(cwd, 'holocron.config.json'), '{ not valid json')
    await expect(loadConfig(cwd)).rejects.toBeInstanceOf(ConfigError)
    await expect(loadConfig(cwd)).rejects.toThrow(/not valid JSON/)
  })

  it('errors when the JSON is valid but the schema fails (vault missing)', async () => {
    await writeFile(
      join(cwd, 'holocron.config.json'),
      JSON.stringify({ project: { name: 'demo' }, providers: { source: 'github' } }),
    )
    await expect(loadConfig(cwd)).rejects.toThrow(/vault/)
  })

  it('rejects holocron.config.js with a v2.0 not-supported message', async () => {
    await writeFile(join(cwd, 'holocron.config.js'), 'export default { project: {} }')
    await expect(loadConfig(cwd)).rejects.toThrow(/JSON form/)
    await expect(loadConfig(cwd)).rejects.toThrow(/issue #75/)
  })

  it('prefers .json over .js when both exist (lookup-order commitment)', async () => {
    await writeFile(
      join(cwd, 'holocron.config.json'),
      JSON.stringify({
        project: { name: 'json-wins' },
        providers: { vault: '1password' },
      }),
    )
    await writeFile(join(cwd, 'holocron.config.js'), 'export default { project: {} }')
    const { resolved } = await loadConfig(cwd)
    expect(resolved.project.name).toBe('json-wins')
  })
})
