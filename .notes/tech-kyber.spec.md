---
id: SPEC-0067
status: draft
issue: theholocron/holocron#1727
blocked-by: []
related:
  - theholocron/holocron#1714
  - theholocron/holocron#438
  - theholocron/holocron#1052
discussion:
  url: https://discord.com/channels/1303969001822486568/1567797286703202306
---

# `@theholocron/kyber`: the reusable parts of the CLI

## Problem

`cli/cli` has about 8k lines outside `commands/`, and roughly 3k of them do not depend on holocron: terminal styling,
prompts, the update notifier, the handling of tokens and token files, the test harness and the global flags. A second CLI
would copy them. The same applies to the `cli-template` repo, which ships a CLI skeleton today without any of it.

## Goals

- One package, `@theholocron/kyber` in `cli/kyber`, with a subpath per concern, so a CLI takes only what it uses.
- The CLI consumes it from the first move, so every extraction is proven by the CLI's own tests and nothing is moved
  without a user.
- No behaviour change in any PR of the stack.
- `cli-template` is the second consumer.

## Non-goals

- `commands/`, `presets/`, `templates/` and the docs-coverage probes. They are holocron.
- The capability/provider plugin framework (`plugin/`, 3.6k lines) and the command registry with its menu fallback
  (`interactive-menu/`). Both are worth extracting but are coupled to holocron's commands and capabilities, so they get
  their own spec once a second CLI shows what the seam is.
- Config loading (`@theholocron/datapad`) and logging/telemetry (`@theholocron/observability`) already exist.

## Name and place

`kyber`, after the crystal at the heart of a lightsaber. It lives in `cli/kyber`, next to `datapad` (the other generic
piece), on the `cli` version line.

## Shape

One package, subpath exports, each one mapped to a source folder (`subpath-entries.ts` maps exports to sources for the
docs-coverage probe). Heavy libraries are peer dependencies of the subpath that uses them, so a consumer pays only for
what it imports.

| Subpath     | From (today)                                                                                                                                                             | What it gives a CLI                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ui`       | `ui/`: `style`, `status-row`, `json-view`, `progress`, `wait-for-enter`, `open-path`, `non-interactive-error`                                                            | Status glyphs and colours, padded status rows, a depth-limited JSON view, a spinner that only shows on a terminal, an error for "a prompt was needed but there is no terminal". |
| `/prompts`  | `ui/`: `menu`, `prompt-positionals`, `prompt-options` and the entry types they read                                                                                      | A searchable menu, prompting for missing positionals and options, secret options delivered through the environment, a value that is asked last.                                 |
| `/notifier` | `update-notifier/`                                                                                                                                                       | A cached, best-effort "a newer version exists" notice. Takes the package name, cache directory and release channel as parameters instead of holocron's.                         |
| `/secrets`  | `auth/`: `private-file`, `shred-file`, `credentials-file`, `git-ignored`, `dotenv-line`, `dotenv-file`, `copy-to-clipboard`, `keyring`, `credential-store`, `token-args` | Handling tokens safely, with nothing tied to holocron (see below).                                                                                                              |
| `/testing`  | `testing/`: `run-cli`, `run-command`, `build-cli`, `hermetic-require`, `silence-logger`                                                                                  | Run a built binary, run one command module through a real yargs parse, make sure `dist` is current before a suite, resolve modules only from one directory.                     |
| `/flags`    | `cli-support/`: `global-args`, `infer-args`, `token-context`, `group-menu`                                                                                               | `--dry-run`, `--cwd`, repeatable `--token`, and a bare group command that opens a menu at that level.                                                                           |

### `/secrets`

The part meant for every project, so it has no terminal UI and no holocron name in it:

- owner-only files (`0600`, set again on the open file so a loose `umask` cannot widen it), created only if new;
- shredding: overwrite with zeros, close, remove, for a file that held tokens;
- "does git ignore this path" before a secret file is written next to the code;
- writing and reading a dotenv file, with a value that needs quoting refused or quoted rather than corrupted;
- the clipboard, loaded only when asked for;
- the keyring behind `@napi-rs/keyring`, an optional peer because it is a native module, with a clear "unavailable"
  answer instead of an uncaught error;
- the in-process store for variables read from a provider, and parsing of repeatable `--token vendor=value` flags.

The token resolution order (flag, process environment, `.env`, providers, keyring) stays a composition the CLI builds
from these pieces. `createResolveToken` already lives in `@theholocron/http-client`; whether `/secrets` re-exports or
wraps it is an open question below.

## What changes in holocron

Nothing a user can see. Imports in `cli/cli/src` move from `../ui/...` and `../auth/...` to `@theholocron/kyber/<subpath>`
and the moved sources, tests and barrels are deleted. Holocron-specific pieces stay: `USER_FACING_ERRORS` (the list of
this CLI's error classes) and `describeProviderError` stay in the CLI and use kyber's generic formatting; the temp
monorepo fixtures and `TEST_ORG` stay in the CLI's own `testing/`.

## Publishing

`kyber` starts `"private": true` and is inlined into the CLI's build with `alwaysBundle`, exactly as `dagobah` is. A
public package cannot be a dependency of the CLI until it exists on npm, and a first publish needs a trusted publisher
registered by hand, so publishing in the middle of the stack would risk a CLI release that depends on a package npm
cannot serve.

While it is bundled, every external it imports (`chalk`, `ora`, `@inquirer/prompts`, `clipboardy`, `@napi-rs/keyring`,
`yargs`) must stay a dependency of the CLI; `holocron deploy stage`'s check for undeclared externals is the model, and the
CLI's published `package.json` is checked after the first move.

It becomes public in the PR that `cli-template` needs it: remove `private`, remove `alwaysBundle`, declare the peers,
`holocron package publish --initial` and the trusted publisher by the maintainer, in that order.

## Rollout: a stack of small PRs

Each PR moves one subpath, with its tests, its doc comments (the `documentation` flag counts every export, nested
members included), its `AGENTS.md` line and the workspace wiring (`knip.config.ts`, `holocron repo sync` for `codecov.yml`
and `ci.test-unit.yml`, the lockfile). Each is based on the one before and retargeted to `alpha` as the one below merges.

1. This spec.
2. Scaffold `cli/kyber` and move `/ui` (the output half: style, status rows, JSON view, progress, wait-for-enter,
   open-path, the non-interactive error).
3. `/notifier`, parameterised.
4. `/secrets`, files: private file, shred, credentials file, git-ignored, dotenv line and file, clipboard.
5. `/secrets`, store: keyring, credential store, token-argument parsing.
6. `/prompts`.
7. `/testing`.
8. `/flags`.
9. Documentation: a kyber page in the docs site.

The order puts the pieces with no inbound surprises first and the ones that touch the most call sites (`/prompts`,
`/flags`) after the package has proven the bundling.

## Second consumer

`cli-template` adopts kyber in its own PR after step 8, once the maintainer says holocron has settled enough to touch the
template repos (the template repos are held until then). That PR is also when kyber becomes public.

## Open questions

- Does `/secrets` re-export or wrap `createResolveToken` from `@theholocron/http-client`, or should the resolver move
  into kyber and `http-client` import it?
- Should `/prompts` take the entry types from the CLI's registry (`CommandEntry`) or own a smaller structural type that
  the registry satisfies? The second keeps the registry extraction open.
- Version line: lockstep with the CLI group while it is private; revisit when it goes public.
