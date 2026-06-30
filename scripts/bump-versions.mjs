#!/usr/bin/env node
/**
 * Lockstep version bump for the holocron monorepo.
 *
 * Called by semantic-release's `@semantic-release/exec.prepareCmd`
 * step with the new version as the only argument. Updates the root
 * package.json + every public package under `packages/*` to the
 * same version (private packages like `cli-utils` are skipped).
 *
 * Run manually: `node scripts/bump-versions.mjs 2.0.0-alpha.1`
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nextVersion = process.argv[2]

if (!nextVersion) {
  console.error('usage: bump-versions.mjs <next-version>')
  process.exit(1)
}

function bumpFile(absPath, label) {
  const pkg = JSON.parse(readFileSync(absPath, 'utf8'))
  if (pkg.private) {
    console.log(`  · skipping private package ${label}`)
    return
  }
  const old = pkg.version
  pkg.version = nextVersion
  writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`  ✓ ${label}: ${old} → ${nextVersion}`)
}

console.log(`Bumping holocron monorepo to ${nextVersion}…`)

// Root package.json
bumpFile(join(repoRoot, 'package.json'), '@theholocron/holocron-monorepo')

// Each package under packages/
const packagesDir = join(repoRoot, 'packages')
const entries = readdirSync(packagesDir)
for (const entry of entries) {
  const pkgDir = join(packagesDir, entry)
  if (!statSync(pkgDir).isDirectory()) continue
  const pkgFile = join(pkgDir, 'package.json')
  try {
    statSync(pkgFile)
  } catch {
    continue
  }
  bumpFile(pkgFile, `packages/${entry}`)
}
