#!/usr/bin/env -S node --experimental-strip-types --no-warnings=ExperimentalWarning

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// v2-alpha entry. Capability loading, plugin resolution, and command
// registration land in the next commits per the architecture spec at
// `.notes/tech-architecture.spec.md`.

await yargs(hideBin(process.argv))
  .scriptName('holocron')
  .usage('$0 <command> [options]')
  .command(
    'version',
    'Print the CLI version',
    () => {},
    () => {
      // The version lives in package.json; loaders for that arrive
      // with the build pipeline. Placeholder for the alpha.
      console.log('holocron 2.0.0-alpha.0')
    },
  )
  .demandCommand(1, 'Run `holocron --help` to see available commands.')
  .strict()
  .help()
  .parse()
