#!/usr/bin/env -S tsx

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { runDoctor } from './commands/doctor.js'
import { loadConfig } from './load-config.js'

await yargs(hideBin(process.argv))
  .scriptName('holocron')
  .usage('$0 <command> [options]')
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
      y
        .option('cwd', {
          type: 'string',
          default: process.cwd(),
          describe: 'Directory to search for holocron.config.json',
        })
        .option('repo', {
          type: 'string',
          describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
        }),
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      const report = await runDoctor({
        loaded,
        context: { repoRoot: argv.cwd, ...(argv.repo ? { repo: argv.repo } : {}) },
      })
      if (report.summary.fail > 0) {
        process.exitCode = 1
      }
    },
  )
  .command(
    'config show',
    'Print the resolved holocron config',
    (y) =>
      y.option('cwd', {
        type: 'string',
        default: process.cwd(),
        describe: 'Directory to search for holocron.config.json',
      }),
    async (argv) => {
      const loaded = await loadConfig(argv.cwd)
      console.log(JSON.stringify(loaded.resolved, null, 2))
    },
  )
  .demandCommand(1, 'Run `holocron --help` to see available commands.')
  .strict()
  .help()
  .parse()
