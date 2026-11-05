# `@theholocron/kyber`

The reusable parts of a command-line tool: terminal output, prompts, the update notifier, safe handling of tokens, a
test harness and the global flags. They were written for the Holocron CLI and are moved here one subpath at a time, so
the next CLI does not copy them (spec `tech-kyber`, #1727).

Internal for now: private, bundled into `@theholocron/cli`, not published. It becomes public when a second CLI needs it.

> The kyber crystal is the part in a lightsaber that makes it work.

## Subpaths

| Subpath     | What it gives a CLI                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/ui`       | Status glyphs and colours, padded status rows, a depth-limited JSON view, a spinner that only shows on a terminal, wait-for-Enter, open-in-file-browser, and the error for "a prompt was needed but there is no terminal".                                                                                                                                                                                                                                         |
| `/notifier` | A cached, best-effort "a newer version exists" notice for an npm package: `checkForUpdates({ name, currentVersion, cacheDir })` returns a function that prints a boxed notice to stderr, or `null`. Silent in CI and with `NO_UPDATE_NOTIFIER`.                                                                                                                                                                                                                    |
| `/secrets`  | Handling tokens safely, with no terminal UI: owner-only (`0600`) files, shredding a file that held tokens, "does git ignore this path", dotenv lines that survive quoting, reading a `.env` at the repo root, the clipboard, the OS keyring (`createKeyring({ service })`, best-effort, `@napi-rs/keyring` optional), an in-process store for credentials a provider returned, and `--token` / `--token vendor=value` parsing.                                     |
| `/prompts`  | A searchable menu (`pickMenuItem`), and prompting for the positionals and options a command left out (`promptForPositionals`, `promptForOptions`): required options always asked, the rest behind one checkbox, mutually exclusive `modes`, secret options masked, and a value that is asked last (`askLast`). They take small structural types (`PositionalCommand`, `OptionsCommand`), not the CLI's command registry.                                           |
| `/testing`  | A test harness for a CLI: `createCliRunner` runs a built binary in a fresh directory with an environment built from nothing, `runCommand` runs one yargs command module through a real parse, `ensureBuilt` is a Vitest global setup that builds only when `dist` is missing or stale, and `hermeticCreateRequire` resolves modules only from one directory.                                                                                                       |
| `/flags`    | The options every command of a tool takes: `addGlobalOptions(parser, { describe?, cwd? })` declares `--dry-run`, a repeatable `--token` and `--cwd` once on the root; `tokenContext(values, report)` parses the `--token` values and reports a bad one without a stack trace; `groupMenu(parent, open)` is the hidden default command that makes a bare group (`tool repo`) do something useful; `InferArgs` types a command's handler arguments from its builder. |

## Usage

```ts
import { createProgress, statusRow, style, viewJson } from "@theholocron/kyber/ui";

console.log(style.success("built"));
console.log(statusRow("ok", "lint", "no problems"));
```

```ts
import { addGlobalOptions, tokenContext } from "@theholocron/kyber/flags";
import { createKeyring } from "@theholocron/kyber/secrets";

const parser = addGlobalOptions(yargs(hideBin(process.argv)), { describe: { cwd: "Where tool.config.json is" } });
const tokens = tokenContext(argv.token, console.error); // null (and exit code 1) for a malformed --token
const keyring = createKeyring({ service: "com.example.tool" }); // best-effort: never throws
```

Each subpath's heavy libraries (`chalk`, `ora`, `@inquirer/prompts`, `yargs`, `dotenv`, `clipboardy`, `@napi-rs/keyring`) are
optional peer dependencies: a CLI installs the ones for the subpaths it imports.

`createProgress(print, enabled?, listen?)` takes an optional `listen` hook that can change the spinner's text while a step
runs, for instance to say that a request is being sent again; the Holocron CLI uses it for its retry notice.
