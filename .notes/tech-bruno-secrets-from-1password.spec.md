---
id: SPEC-0094
status: proposed
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

## The spike (2026-11-18, the real Bruno desktop app)

Bruno's docs say `{{process.env.NAME}}` is read from a `.env` file at the collection or workspace root. A throwaway
collection with `{{process.env.PROBE}}` answered the questions the design hung on:

1. **`process.env` does not read the Bruno process's own environment.** Started with `PROBE=from-process` in its
   environment, a request using `{{process.env.PROBE}}` failed with "variables that could not be resolved", and
   `bru.getProcessEnv("PROBE")` was `undefined`. The route that starts Bruno with the values in its environment (once
   "Route A") is dead.
2. **A `.env` at the collection root works.** `{{process.env.PROBE}}` resolved in a header field, in an environment
   variable whose value is `{{process.env.PROBE}}` (then read in a field as `{{probe}}`), in a script through
   `bru.getEnvVar("probe")` (which returns the **resolved** value, not the placeholder, so the signing scripts that read
   `bru.getEnvVar("webhookSecret")` need no change) and through `bru.getProcessEnv("PROBE")`.
3. **A `.env` that is a symlink works** (`collection/.env` pointing at `../real.env`), read the same. So the secret stays in
   `.holocron/.private/` and the private-directory rule has no exception.
4. **Bruno stored a resolved value**, but only because the spike sent it in a header and the echo server returned it (Bruno's
   request timeline in its IndexedDB held the request and the response). A signing request sends only the HMAC, so the
   secret itself should not be stored. **Not tested; an unverified residual.**
5. **Not answered**, and not needed now: which of a process variable and a `.env` wins when both exist (the process route
   is dead), how `bru run` behaves, a workspace-level `.env`, and whether Bruno persists a value that only a script reads.
6. **Considered and rejected:** mounting the Environment through 1Password's "Local .env file" destination (a named pipe;
   beta, Mac and Linux only, one Environment per path, set up by hand in the app so could be forgotten, and unknown how Bruno
   reads a pipe). The command could use it later as a source of the file; it is not the design.

## Decision

**A `.env` file, symlinked** (the spike's Route B, the only one left). `holocron open requests [--environment <layer>]`
(a `workspace` command; `COMMAND_CONTEXTS`, `COMMAND_REGISTRY` and the menu decision in the same change) reads the
values, writes them to a private file in `.holocron/.private/`, links `<collection>/.env` to it, starts Bruno in the
foreground and removes the file and the links when Bruno ends.

### Which name goes where

The collection's variable (`webhookSecret`) and the 1Password entry (`SENTINEL_WEBHOOK_SECRET`) have different names, and
the Bruno plugin declares no tokens, so something has to map one to the other. The mapping is the `secretRefs` option of
the `bruno` tooling provider in `holocron.config.ts` (genuine per-repo variance, declared once):

```ts
["bruno", { secretRefs: { webhookSecret: "SENTINEL_WEBHOOK_SECRET", sentrySecret: "COMLINK_SENTRY_SECRET" } }];
```

`sync requests` writes each named secret into the generated `.bruno/` environments as a reference, and the command reads
the references back out of those files (the workspace is the one place the mapping reaches the command), so the committed
files hold a reference, never a value.

#### Answer to the former open question 8: a reference survives `sync requests` only if the sync writes it

Two facts decided it, both checked in the code:

- **Bruno's file format cannot hold a reference on a secret.** `parseEnvironment` drops the `value` of a variable with
  `secret: true` (Bruno keeps a secret's value in its own store), and `stringifyEnvironment` never writes one. So a
  secret variable cannot carry `{{process.env.NAME}}`, in the committed file or after Bruno saves it.
- **The sync does not carry a workspace-only edit through on its own.** A request-file change regenerates the workspace
  file (dropping a hand-added reference), and when neither side changed the pair is "in step" and left alone, so a
  reference would never be added to the files already committed.

So the reference is a **plain variable whose value is `{{process.env.NAME}}`**, which is also how Bruno's docs say to read a
`.env` value, and the sync is taught about it in both directions (`plugins/holocron-plugin-bruno`, `secret-references.ts`):

- Source to workspace: a secret named in `secretRefs` is written as that plain variable (`withSecretReferences()`, in
  `collectionFiles()` and the environment pairs), and a workspace file already in step gets its references added without
  any other byte changing (`healReferences()`, reported as a `changed` file so `--check` fails until it is committed).
- Workspace to source: a variable whose value is exactly one `{{process.env.NAME}}` reads back as the **blank secret** it
  came from (`environmentToSource()`), so the request files keep a blank secret and Postman never sees a reference. The
  environment's comparison hash is unchanged by the reference, so no pair turns into a conflict.
- A secret with no `secretRefs` entry stays a blank secret, and the command lists it as one nobody fills.

The request files (`webhook.environment*.json`, `worker.environment.json`) are unchanged by this work.

### Which values it reads

The command asks the `tooling` provider what the workspace wants (`Tooling.open`, optional: the references found in the
`.bruno/` environments, the `.env` path of each collection, how to start the tool and how to tell it is running; names and
paths only, no value) and takes exactly those entry names from the layer's Environment, and nothing else. A name the
Environment lacks, or holds blank, is a failing row naming it, so a request never goes out unsigned without the person
being told. A secret variable with no reference is reported by name and filled by nobody.

### Starting Bruno

Bruno keeps one running instance, and a second launch attaches to it without the new values, so a launch while it is
running would use an old or empty secret, or another layer's. The command looks for a running Bruno first (the provider's
`running` text against the process list), refuses with a message that says to quit it, and never kills it. Two launches that
start at the same moment race on that check, so the command takes a lock file (`.holocron/.private/open-requests.lock`,
holding its pid; a lock of a process that has ended is replaced) for the whole session.

The program is started **in the foreground** (`/Applications/Bruno.app/Contents/MacOS/Bruno <workspace>`; the `app` option
sets another program, and a platform with no default must set it), not with `open -a`, which hands the launch to
LaunchServices and returns at once. The values therefore live exactly as long as the Bruno process: until the person quits
Bruno, or presses Ctrl-C in the terminal. Nothing here has been run against the real app (see "Unverified").

### The values file and the links

- The file is `.holocron/.private/requests.env`, made with `createPrivateFile()` (mode 0600, set again on the open file,
  refused when the path exists) after git confirms the path is ignored (`tracked` or `unknown` is a refusal); each line is
  `dotenvLine(NAME, value)`, and a value dotenv cannot read back as written is a failing row, never a different value.
- Each `<collection>/.env` is a relative symlink to it, made only after every place is known to be free or this command's
  own leftover. Nothing is overwritten.
- It does not use `finishCredentialsFile()` (which waits for a 1Password import and, with no terminal, leaves the file on
  purpose): this file is the command's own, so it is removed in a `finally` and on `SIGINT`, `SIGTERM`, `SIGHUP` and exit,
  whether or not a terminal is attached. The links are removed only while they still point at this file.
- Nothing can run on `SIGKILL` or a crash, so there is no cleanup promise for them. The file starts with a marker line
  naming the command; a later run removes a leftover that has the marker (and a link to the file) and refuses anything
  without it. The values are in plaintext on disk for the length of the session.
- On Windows it refuses (no enforced mode bits, and a link needs rights it may lack).

### A concealed value

The secrets are concealed entries in the Environment. The rule in `AGENTS.md` for `probe --environment` is that a concealed
value is never handed over, and `environmentTokens()` returns only the visible ones as `plain`. This command cannot work
under that rule, so it is a deliberate, narrower exception, **approved by the maintainer** and recorded in `AGENTS.md`
beside the rule in the same change: the command reads the declared entries through `readEnvironmentEntries` (which carries
`concealed`), takes only the names the workspace's references list (every other entry is dropped before the function
returns), does so only for a process the person starts on their own machine, and never hands a value to a plugin, a log or
a row. `readEntryValues()` is the one place the exception lives.

## Security

- The values come from 1Password through the credentials path that already exists; no new token, no new service account.
- Only names the workspace's references list are read and written; a value is never printed, logged or returned. The
  concealed-value exception above is the only place a value leaves the Environment's memory.
- The values file follows the private-file rules and lives in the private directory; the symlink in the collection folder
  is ignored by the existing `.env` rule and holds no secret itself.
- The committed files hold a reference, never a value; the request files hold a blank.
- `--dry-run` lists the names that would be filled and starts nothing; without `--yes` the command asks first (and refuses
  without a terminal).

## Unverified

Built and tested with injected collaborators, because the author could not run Bruno or 1Password:

- That the Bruno binary accepts the workspace folder as its argument and opens it, and that the foreground process stays
  until the person quits (so that cleanup is tied to the session). If Bruno hands off and exits at once, the file is removed
  while Bruno is still open, and the program or its arguments need adjusting (`app` option, `ToolingOpenPlan.launch`).
- That a secret stored by Bruno after a signing request holds only the HMAC and not the secret (spike point 4).
- That Bruno reads a `.env` that appears after the workspace is open, which the command avoids by writing it before launch.

## Done when

- `holocron open requests` starts Bruno with the secrets, with tests for the mapping from references to entry names, a
  missing entry, a run with nothing to fill, the running-Bruno refusal, the lock, the marker and stale-file rule, the
  cleanup paths (success, failure, signal) and `--dry-run`.
- The committed Bruno environments name their variables, the request files stay unchanged for Postman, and
  `sync requests --check` stays clean.
- `AGENTS.md` records the command and the concealed-value exception; `apps/sentinel/README.md` and
  `apps/comlink/README.md` say how to send a request.
