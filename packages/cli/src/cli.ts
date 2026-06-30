#!/usr/bin/env -S tsx

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { runDeploy } from './commands/deploy.js'
import { runDoctor } from './commands/doctor.js'
import { runSecretSet } from './commands/secret-set.js'
import { runSecretsSync } from './commands/secrets-sync.js'
import { runSetup } from './commands/setup.js'
import { loadConfig } from './load-config.js'

await yargs(hideBin(process.argv))
  .scriptName('holocron')
  .usage('$0 <command> [options]')
  // ── global options (apply to every subcommand) ──────────────────────
  .option('dry-run', {
    type: 'boolean',
    default: false,
    describe:
      'Print what would be mutated without calling capability mutators. ' +
      'Commands branch on this; read-only commands ignore it.',
  })
  .option('token', {
    type: 'string',
    describe:
      'Vendor token passed to plugins as `cliToken`, taking precedence over env vars. ' +
      'Unambiguous for single-plugin commands; for multi-plugin flows pass per-vendor env vars instead.',
  })
  .option('cwd', {
    type: 'string',
    default: process.cwd(),
    describe: 'Directory to search for holocron.config.json',
  })
  // ── commands ────────────────────────────────────────────────────────
  .command(
    'version',
    'Print the CLI version',
    () => {},
    () => {
      console.log('holocron 2.0.0-alpha.0')
    },
  )
  .command(
    'doctor',
    'Load the config and run a smoke check against every provider',
    (y) =>
      y.option('repo', {
        type: 'string',
        describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
      }),
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      const report = await runDoctor({
        loaded,
        context: {
          repoRoot: argv.cwd,
          dryRun: argv.dryRun,
          ...(argv.repo ? { repo: argv.repo } : {}),
          ...(argv.token ? { cliToken: argv.token } : {}),
        },
      })
      if (report.summary.fail > 0) {
        process.exitCode = 1
      }
    },
  )
  .command(
    'setup',
    'Apply infra setup actions across every configured capability',
    (y) =>
      y.option('repo', {
        type: 'string',
        describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
      }),
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      const report = await runSetup({
        loaded,
        context: {
          repoRoot: argv.cwd,
          dryRun: argv.dryRun,
          ...(argv.repo ? { repo: argv.repo } : {}),
          ...(argv.token ? { cliToken: argv.token } : {}),
        },
      })
      if (report.summary.fail > 0) {
        process.exitCode = 1
      }
    },
  )
  .command(
    'secret set <name> [value]',
    'Set a single secret via the configured `secrets` capability',
    (y) =>
      y
        .positional('name', {
          type: 'string',
          demandOption: true,
          describe: 'Secret name (e.g., NPM_TOKEN)',
        })
        .positional('value', {
          type: 'string',
          describe:
            'Secret value (positional). If omitted, sources from --from-stdin, --from-env, or env var matching <name>.',
        })
        .option('from-stdin', {
          type: 'boolean',
          default: false,
          describe: 'Read the secret value from stdin',
        })
        .option('from-env', {
          type: 'string',
          describe: 'Read the secret value from the named env var (otherwise: env var matching <name>)',
        })
        .option('scope', {
          type: 'string',
          default: 'repo',
          describe: 'Scope: "repo" (default), "env=<name>", or "org=<name>"',
        }),
    async (argv) => {
      const scopeArg = argv.scope as string
      const scope = parseScope(scopeArg)
      const report = await runSecretSet({
        loaded: await loadConfig(argv.cwd),
        context: {
          repoRoot: argv.cwd,
          dryRun: argv.dryRun,
          ...(argv.token ? { cliToken: argv.token } : {}),
        },
        name: argv.name as string,
        ...(argv.value ? { value: argv.value as string } : {}),
        ...(argv.fromStdin ? { fromStdin: true } : {}),
        ...(argv.fromEnv ? { fromEnv: argv.fromEnv as string } : {}),
        scope,
      })
      if (report.status === 'fail') {
        process.exitCode = 1
      }
    },
  )
  .command(
    'secrets sync <environmentId>',
    'Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars',
    (y) =>
      y
        .positional('environmentId', {
          type: 'string',
          demandOption: true,
          describe: 'Vault environment id to read (1P Environment id, etc.)',
        })
        .option('project-id', {
          type: 'string',
          describe: 'Deployment project id (e.g., Vercel prj_*). Required when deployment is loaded.',
        })
        .option('target', {
          type: 'array',
          default: ['production', 'preview'] as Array<'development' | 'preview' | 'production'>,
          describe: 'Deployment targets to sync to. Defaults to production + preview.',
        }),
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      const report = await runSecretsSync({
        loaded,
        context: {
          repoRoot: argv.cwd,
          dryRun: argv.dryRun,
          ...(argv.token ? { cliToken: argv.token } : {}),
        },
        environmentId: argv.environmentId as string,
        ...(argv.projectId ? { projectId: argv.projectId } : {}),
        targets: argv.target as Array<'development' | 'preview' | 'production'>,
      })
      if (report.summary.fail > 0) {
        process.exitCode = 1
      }
    },
  )
  .command(
    'deploy <branch>',
    'Trigger a deployment via the configured `deployment` capability',
    (y) =>
      y
        .positional('branch', {
          type: 'string',
          demandOption: true,
          describe: 'Git branch to deploy',
        })
        .option('project-id', {
          type: 'string',
          demandOption: true,
          describe: 'Deployment project id (e.g., Vercel prj_*)',
        })
        .option('target', {
          type: 'string',
          choices: ['production', 'staging'] as const,
          describe: 'Named environment to deploy into. Omit for a branch preview.',
        }),
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      const report = await runDeploy({
        loaded,
        context: {
          repoRoot: argv.cwd,
          dryRun: argv.dryRun,
          ...(argv.token ? { cliToken: argv.token } : {}),
        },
        projectId: argv.projectId as string,
        branch: argv.branch as string,
        ...(argv.target ? { target: argv.target as 'production' | 'staging' } : {}),
      })
      if (report.status === 'fail') {
        process.exitCode = 1
      }
    },
  )
  .command(
    'config show',
    'Print the resolved holocron config',
    () => {},
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      console.log(JSON.stringify(loaded.resolved, null, 2))
    },
  )
  .demandCommand(1, 'Run `holocron --help` to see available commands.')
  .strict()
  .help()
  .parse()

/**
 * Parse `--scope` strings: `repo` | `env=NAME` | `org=NAME`.
 */
function parseScope(s: string): { kind: 'repo' } | { kind: 'environment'; name: string } | { kind: 'organization'; name: string } {
  if (s === 'repo') return { kind: 'repo' }
  if (s.startsWith('env=')) return { kind: 'environment', name: s.slice('env='.length) }
  if (s.startsWith('org=')) return { kind: 'organization', name: s.slice('org='.length) }
  throw new Error(`invalid --scope "${s}" — expected "repo", "env=<name>", or "org=<name>"`)
}
