---
id: SPEC-0094
status: draft
issue: theholocron/holocron#2322
blocked-by: []
related:
  - theholocron/holocron#2189
  - theholocron/holocron#2276
discussion:
  url: https://discord.com/channels/1303969001822486568/1572378327677665464
---

# Bruno: fill a collection's secrets from the layer's 1Password Environment

## Problem

A signed request needs a secret (Sentinel's `webhookSecret`, Comlink's `sentrySecret`). The committed Bruno environments
leave it blank on purpose, so each person pastes it into Bruno's own store, once per environment, on each machine. It
drifts from the value in 1Password, a rotation is missed, and a person has to open 1Password and copy a production secret
by hand to send one request. The same secret already lives in `<org/repo> - <layer>`, which Holocron reads in memory
for `holocron dev` and for the credentials provider.

## Goals

- A person with access to the layer's 1Password Environment sends a signed request with no copy and paste.
- The secret is never in a file that is committed, in the request files, in a script or in a log.
- The committed `.bruno/` workspace and the request files (`sync requests`) stay the source; nothing here edits them by hand.
- Nothing runs from inside Bruno beyond what the collection already runs.
- The request files keep working in the other tooling provider (Postman): nothing Bruno-specific reaches them.

## Non-goals

- Writing into Bruno's own encrypted store (it has no documented way to clear a value).
- Teaching Bruno about 1Password (no Bruno plugin, no `op` call from a pre-request script, no filesystem access switched on).
- The scheduled and CI paths: they do not use Bruno.

## Why not op-bruno

`op-bruno` (a third-party CLI) syncs secrets by turning on filesystem access in `bruno.json` and adding a pre-request script
that runs the `op` CLI. Anyone who can edit the collection can then change what runs, the fetched values are persisted in
Bruno's store with no way to clear them (its own README says so), and it is one maintainer with no releases. Reviewed from
its README only (its source pages were unreachable).

## Design

`holocron sync requests` is the wrong home: it writes files and reads no secret. A new command opens Bruno:
`holocron open requests [--environment <layer>]` (a `workspace` command, `COMMAND_CONTEXTS` and `COMMAND_REGISTRY`
entries, the menu decision in the same PR). It:

1. Works out which values the collection wants (see "Which name goes where").
2. Reads the layer's Environment in memory and takes only those names (see "A concealed value").
3. Refuses when Bruno is already running (see "Starting Bruno").
4. Hands the values to Bruno by one of two routes, decided by the spike below.
5. Prints names and the route, never a value.

### Which name goes where

The collection's variable (`webhookSecret`) and the 1Password entry (`SENTINEL_WEBHOOK_SECRET`) have different names, and
the Bruno plugin declares no tokens, so nothing maps one to the other yet. The mapping is one place, the committed
environment itself: the secret variable's value is a reference, `{{process.env.SENTINEL_WEBHOOK_SECRET}}`, and the command
reads the references out of the collection's environment files and looks up exactly those entry names in the layer's
Environment. A secret variable with no reference is reported by name and filled by nobody; an entry the Environment lacks
is a failing row naming it, so a request never goes out unsigned without the person being told.

The reference must not reach the other provider. The request files are the shared source, and Postman reads
`pm.environment.get("webhookSecret")` as a plain value, so a `{{process.env...}}` string stored in the shared
`webhook.environment.json` would be sent to Postman as the secret. The reference therefore lives only in the generated
Bruno workspace (`.bruno/`), and the request files keep the blank value. How a workspace-only value survives
`sync requests` is part of the spike (the baseline already leaves a setting only the workspace holds alone); if it cannot,
the command supplies the reference itself when it opens Bruno and the committed files hold nothing.

### Starting Bruno

Bruno keeps one running instance, and a second launch attaches to it without the new values, so a launch while it is
running would use an old or empty secret, or another layer's. The command does not guess: it looks for a running Bruno
first, refuses with a message that says to quit it, and never kills it. A second `open requests` started for a different
layer while the first is open is the same case and is refused the same way. Two launches that start at the same moment
race on that check, so the command takes a lock file in `.holocron/.private/` for the duration of the launch.

### Route A: the process environment

Start the Bruno binary directly (not `open -a`, which does not pass the environment on macOS) with the values in its
environment, through `superviseProcesses()`-style supervision like `holocron dev`. Nothing is written to disk by Holocron.

The child's environment is built, not inherited. It holds the values the command was asked to pass, and only what the app
needs to run (`PATH`, `HOME`, `TMPDIR`, `USER`, `LANG`, the display and locale variables the platform requires), as a
fixed list in one place. Every other variable of the calling shell stays out, because a collection script runs inside
Bruno and can read its whole environment. For the same reason a declared secret name that the layer's Environment does not
hold is never inherited from the shell: it is absent from the child, so a stale or wrong-layer value in the shell cannot
sign a request.

### Route B: a `.env` file

Write the values to `<collection>/.env` (the file Bruno documents for `process.env`). This is an exception to the
private-directory rule (`.holocron/.private/` holds files that carry secrets), because Bruno reads `.env` from the
collection root and the spike has not shown it reads another path. A symlink from `<collection>/.env` to a file in
`.holocron/.private/` would keep the secret inside the private directory and is the first thing the spike tries; if it
works, Route B uses it and there is no exception.

The file is made with the protections of `export tokens` (mode 0600, git-ignored, refused when the version control system
does not say the path is ignored, never overwritten), but not with its cleanup. `finishCredentialsFile()` waits for an
import and, when the command is not interactive, leaves the file on disk on purpose, which is wrong here: this file is
the command's own, so it is removed in a `finally` and on `SIGINT`, `SIGTERM` and exit whether or not a terminal is
attached.

Nothing can run on `SIGKILL` or a crash, so the spec does not promise cleanup in that case. The file starts with a marker
line naming this command. A later run that finds a file with the marker removes it (it is the command's own leftover, and
says so); one without the marker is somebody else's and is refused, never overwritten. The value is in plaintext on disk
for the length of the session, which Route A avoids, so B is the fallback only.

### A concealed value

The secrets are concealed entries in the Environment. The rule in `AGENTS.md` for `probe --environment` is that a
concealed value is never handed over, and `environmentTokens()` returns only the visible ones as `plain`. This command
cannot work under that rule, so it is a deliberate, narrower exception and needs to be approved as one: the command reads
the declared entries through `readEnvironmentEntries` (which carries `concealed`), only the names the collection's
references list, only for a process the person starts on their own machine, never into a plugin or a log, and `AGENTS.md`
records the exception beside the rule in the same pull request. If the exception is not accepted, the design is limited to
visible values, which the Sentinel and Comlink secrets are not, and the work stops at the spike.

## Open questions (the spike answers all of them)

Bruno's docs say `{{process.env.NAME}}` is read from a `.env` file at the collection or workspace root. They do not say:

1. Whether `process.env` also reads the Bruno process's own environment. This decides Route A against Route B.
2. Whether the desktop app and `bru run` behave the same, and whether `bru run` loads the collection `.env` by itself.
3. Whether a resolved value is written anywhere by Bruno, or cached beyond the session.
4. Whether a script that reads the variable gets the resolved value. The signing scripts read `webhookSecret` with
   `bru.getEnvVar` (which the Postman call `pm.environment.get` converts to). If Bruno resolves `{{process.env.X}}` only in
   request fields and `getEnvVar` returns the literal placeholder, the request is signed with the placeholder. The fallback
   is a script that reads `bru.getProcessEnv("SENTINEL_WEBHOOK_SECRET")`, which Postman does not have, so it would need the
   request files to carry a call that works in both or the signing to move out of the shared script; settle this first.
5. How a collection-root `.env` and a workspace-level `.env` combine when both exist.
6. How the macOS app gets its environment when started from a terminal, which Route A relies on.
7. Whether Bruno reads a `.env` that is a symlink (Route B).
8. Whether a reference stored only in the generated `.bruno/` files is kept by `sync requests` (see "Which name goes where").

The spike: a throwaway collection with `{{process.env.PROBE}}`, started three ways (process environment, collection
`.env`, workspace `.env`), looking at what Bruno resolves in a field and in a script, and at its store and the collection
folder afterwards. Record the answer here before any code.

## Security

- The values come from 1Password through the credentials path that already exists; no new token, no new service account.
- Only names the collection's references list are read and passed; a value is never printed, logged or returned (the probe
  scrubber applies). The concealed-value exception above is the only place a value leaves the Environment's memory.
- Bruno starts with a built environment, never the shell's.
- Route B's file follows the private-file rules except its location, which is the exception stated above unless the
  symlink works; the committed files hold a reference, never a value.
- `--dry-run` lists the names that would be passed and starts nothing.

## Done when

- The spike's answers are in this spec and one route is chosen.
- `holocron open requests` starts Bruno with the secrets, with tests for the mapping from references to entry names, the
  built environment (nothing inherited, a missing entry never filled from the shell), the running-Bruno refusal, the
  cleanup paths of Route B (interactive and not) and the stale-file rule, and a run with nothing to fill.
- The committed Bruno environments name their variables, the request files stay unchanged for Postman, and
  `sync requests --check` stays clean.
- `AGENTS.md` records the command and the concealed-value exception; `apps/sentinel/README.md` and
  `apps/comlink/README.md` say how to send a request.
