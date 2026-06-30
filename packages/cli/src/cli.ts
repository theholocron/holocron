#!/usr/bin/env -S tsx

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { runDoctor } from './commands/doctor.js'
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
