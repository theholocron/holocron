# `@theholocron/kyber`

The reusable parts of a command-line tool: terminal output, prompts, the update notifier, safe handling of tokens, a
test harness and the global flags. They were written for the Holocron CLI and are moved here one subpath at a time, so
the next CLI does not copy them (spec `tech-kyber`, #1727).

Internal for now: private, bundled into `@theholocron/cli`, not published. It becomes public when a second CLI needs it.

> The kyber crystal is the part in a lightsaber that makes it work.

## Subpaths

| Subpath     | State | What it gives a CLI                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/ui`       | moved | Status glyphs and colours, padded status rows, a depth-limited JSON view, a spinner that only shows on a terminal, wait-for-Enter, open-in-file-browser, and the error for "a prompt was needed but there is no terminal".                                                                                                                                                                                                     |
| `/notifier` | moved | A cached, best-effort "a newer version exists" notice for an npm package: `checkForUpdates({ name, currentVersion, cacheDir })` returns a function that prints a boxed notice to stderr, or `null`. Silent in CI and with `NO_UPDATE_NOTIFIER`.                                                                                                                                                                                |
| `/secrets`  | moved | Handling tokens safely, with no terminal UI: owner-only (`0600`) files, shredding a file that held tokens, "does git ignore this path", dotenv lines that survive quoting, reading a `.env` at the repo root, the clipboard, the OS keyring (`createKeyring({ service })`, best-effort, `@napi-rs/keyring` optional), an in-process store for credentials a provider returned, and `--token` / `--token vendor=value` parsing. |

`/prompts`, `/testing` and `/flags` follow, each in its own pull request.

## Usage

```ts
import { createProgress, statusRow, style, viewJson } from "@theholocron/kyber/ui";

console.log(style.success("built"));
console.log(statusRow("ok", "lint", "no problems"));
```

`chalk` and `ora` are optional peer dependencies of `/ui`: a CLI that imports it installs them.

`createProgress(print, enabled?, listen?)` takes an optional `listen` hook that can change the spinner's text while a step
runs, for instance to say that a request is being sent again; the Holocron CLI uses it for its retry notice.
