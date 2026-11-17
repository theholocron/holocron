---
status: draft
issue: theholocron/holocron#2322
blocked-by: []
related:
  - theholocron/holocron#2189
  - theholocron/holocron#2276
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

1. Reads the layer's Environment through `environmentTokens()` / `readEnvironmentEntries` (the machinery `probe --environment`
   uses), in memory. Only the names the collection's environments declare as secrets are taken; nothing else is passed on.
2. Hands them to Bruno by one of two routes, decided by the spike below.
3. Prints names and the route, never a value.

The committed environments name the value instead of leaving it blank: `webhookSecret` is `{{process.env.SENTINEL_WEBHOOK_SECRET}}`.
The variable name comes from the plugin's declaration, so the source request files stay the one place that says it.

### Route A: the process environment

Start the Bruno binary directly (not `open -a`, which does not pass the environment on macOS) with the values in its
environment, through `superviseProcesses()`-style supervision like `holocron dev`. Nothing is written to disk by Holocron.
Needs Bruno fully closed first, or a second launch attaches to the running instance without the values.

### Route B: a `.env` file

Write the values to `<collection>/.env` (the file Bruno documents for `process.env`): mode 0600, git-ignored, never
overwritten, refused when the version control system does not say the path is ignored, deleted when the command ends,
exactly the `export tokens` / `finishCredentialsFile()` protections. The value is in plaintext on disk for the length of
the session; Route A avoids that, so B is the fallback only.

## Open questions (the spike answers the first three)

Bruno's docs say `{{process.env.NAME}}` is read from a `.env` file at the collection or workspace root. They do not say:

1. Whether `process.env` also reads the Bruno process's own environment. This decides Route A against Route B.
2. Whether the desktop app and `bru run` behave the same, and whether `bru run` loads the collection `.env` by itself.
3. Whether a resolved value is written anywhere by Bruno, or cached beyond the session.
4. How a collection-root `.env` and a workspace-level `.env` combine when both exist.
5. How the macOS app gets its environment when started from a terminal, which Route A relies on.

The spike: a throwaway collection with `{{process.env.PROBE}}`, started three ways (process environment, collection
`.env`, workspace `.env`), looking at what Bruno resolves, and at its store and the collection folder afterwards. Record
the answer here before any code.

## Security

- The values come from 1Password through the credentials path that already exists; no new token, no new service account.
- Only names the collection declares are passed; a value is never printed, logged or returned (the probe scrubber applies).
- Route B's file follows the existing private-file rules; the committed environment holds a reference, never a value.
- `--dry-run` lists the names that would be passed and starts nothing.

## Done when

- The spike's answers are in this spec and one route is chosen.
- `holocron open requests` starts Bruno with the secrets, with tests for the choice of names, the refusal paths and a run with nothing to fill.
- The committed Sentinel and Comlink environments name their variables; `sync requests --check` stays clean.
- Docs: `apps/sentinel/README.md` and `apps/comlink/README.md` say how to send a request, and `AGENTS.md` records the command.
