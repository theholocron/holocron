---
status: draft
issue: theholocron/holocron#971
blocked-by: []
related: []
---

# Built-in collapsible JSON viewer

## Context

`holocron config show` prints `JSON.stringify(loaded.resolved, null, 2)`
(`packages/cli/src/cli.ts`). A resolved config is large, flat output is hard to
scan, and there is no folding. The same applies to any future report-style
command.

## Options considered

| Option                                                     | Verdict                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `fx` (npm 40.x)                                            | CLI only: the package has a `bin` and no `main` / `exports` / `types`, so it can't be imported. Requires a separate install. |
| `bat`                                                      | Rust binary, no Node package, highlights but doesn't fold.                                                                   |
| `json-tree-view`, `react-json-view`                        | Browser DOM / React DOM components; don't render in a terminal.                                                              |
| `ink-json-viewer`                                          | Terminal, collapsible, but peers on `ink` ≥ 6 and `react` ≥ 19 — a React renderer in a CLI that has none.                    |
| `json-colorizer`, `cli-highlight`, `prettyjson`, `treeify` | Colour or static tree only; no folding.                                                                                      |
| `blessed-contrib`, `terminal-kit`                          | Full TUI frameworks; far too heavy.                                                                                          |
| **In-repo viewer**                                         | **Chosen.** `chalk` (already a CLI dep) + `node:readline`. No new dependency, no user install.                               |

## Design

Module: `packages/cli/src/json-view.ts`, split into a pure core and a thin TTY layer.

### 1. Tree model and renderer (pure)

- `renderTree(value, { expanded, depth }): Line[]` flattens a JSON value into
  visible lines given a set of expanded paths (JSON-pointer strings).
- A collapsed object/array renders as a one-line summary: `"plugins": {… 4 keys}`,
  `"tasks": [… 12 items]`. Empty containers render inline (`{}` / `[]`).
- `Line` carries `{ path, text, foldable, expanded }` so the TTY layer needs no
  knowledge of JSON.
- Colour via `chalk` (keys, strings, numbers, booleans/null, summaries). Chalk
  already respects `NO_COLOR` / non-TTY.

### 2. Static mode

- `viewJson(value, { depth })` prints the tree with everything deeper than
  `depth` collapsed. Default `depth` is unlimited, so output equals today's.
- **Non-TTY stdout always emits plain `JSON.stringify(value, null, 2)`** ignoring
  `depth` — piping to `jq` or files must stay valid JSON.

### 3. Interactive mode

- Opt-in via `--interactive` (never the default). Checks `process.stdin.isTTY`
  and `process.stdout.isTTY` first; throws `NonInteractiveError` otherwise
  (already in `USER_FACING_ERRORS`).
- Keys: `↑`/`↓` (`k`/`j`) move, `→`/`Enter`/`Space` expand, `←` collapse (or
  jump to parent), `E`/`C` expand/collapse all, `q`/`Esc`/`Ctrl-C` quit.
- Viewport = `process.stdout.rows - 1` lines, scrolled to keep the cursor
  visible; a footer shows position and key hints. Re-render on `resize`.
- Starts with top-level children expanded (or `--depth N` levels).
- Raw mode and cursor visibility are always restored (`finally` + signal
  handlers), including on thrown errors.

### CLI surface

`holocron config show [--depth <n>] [--interactive]`. `config show` is already
`repo-aware` in `COMMAND_CONTEXTS`; no context change. `viewJson()` is shared so
`doctor` and other reports can adopt it later without a new spec.

## Out of scope

- Search / filter inside the viewer.
- Editing values.
- Adopting the viewer in other commands (follow-up issues per command).

## Testing

- Renderer: pure unit tests (collapsed/expanded, empty containers, depth cap,
  summaries, path stability, long strings).
- Static mode: non-TTY emits byte-identical `JSON.stringify` output.
- Interactive: key handler tested as a reducer `(state, key) -> state` with no
  real TTY; one thin test for terminal restore on error.

## Open questions

- Truncate long string values in the tree (with a "show full" key), or wrap?
- Should `--depth` also be honoured by non-TTY output in a `--pretty` flag, or
  stay TTY-only as above?
