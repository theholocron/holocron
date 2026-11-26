---
status: accepted
issue: theholocron/holocron#2629
blocked-by: []
related:
  - theholocron/holocron#2609
---

# Rotate a generated secret

## Problem

`CRON_SECRET` is the secret Vercel's cron sends to Sentinel's `/api/scheduled` (spec `tech-sentinel-scheduled-dispatch`,
#2609). Its value is only random: nobody issues it. Changing it is four hand steps today: make a random value, import it into
the `prod` 1Password Environment, `sync secrets` to Vercel, redeploy. A person who has to do that under pressure (a leaked
value) will get one wrong, and a value typed by hand tends to be short.

`holocron new secret` already pushes one secret, but only to the `secrets` capability's scopes (a repository, one of its
environments, or the organization: GitHub Actions secrets). It does not reach the 1Password Environment, which is the source
of truth, or a Vercel project, so a value set that way is overwritten by the next `sync secrets`.

## Decided

- **`new secret` gains `--target`**, not a new verb. `--target github` is today's behaviour and stays the default, so no
  caller changes. `--target file` is the new one: the value goes to the private import file and nowhere else. It is named
  for what the CLI does, not for where a person takes the file next (1Password today, any vault that imports a `.env`).
- **`--generate` makes the value.** A name must be in a table in the CLI (`GENERATED_SECRETS`: name to byte length and
  encoding; `CRON_SECRET` is 32 random bytes as hex). A name not in it is refused, so a vendor's API token can never be
  invented by mistake. The value comes from `node:crypto` `randomBytes`, never from a command's argument, and is never printed,
  logged or returned. `--generate` with a positional value, `--from-stdin` or `--from-env` is a refusal.
- **`file` is a hand-off, not a write.** The CLI cannot write to a 1Password Environment (`op` has no write for one, and
  `Vault.write` takes an item reference). So the value goes to the private import file the way `export tokens` and the heartbeat
  hand-off do (`.holocron/.private/.credentials`, mode 0600, never overwritten, refused unless git says it is ignored, refused
  on Windows, deleted after the import by `finishCredentialsFile()`), and the command waits for the import. `--env <layer or
name>` (`resolveEnvironmentId()`) is optional with `file`: given, the hint names that Environment and the import is checked
  (below); left out, the command writes the file, waits and checks nothing.
- **Check the import.** With `--env`, before it writes the file the command reads the Environment (names and a salted hash of
  the value, in memory, never printed) and after the wait reads it again: a name that is missing, blank or has the same hash
  is a failing row ("the Environment still holds the old value"), so a forgotten import is caught here and not by a 401
  later. With no readable Environment the check is a skipped row that says why, never a pass.
- **The command ends by naming the next two steps.** After a checked import it prints `holocron sync secrets --env <same>
[--cwd <dir>]`, which carries the new value to Vercel, and says to redeploy, because Vercel only gives a deployment its
  variables at deploy time. It runs neither: the sync's wiring (project id, deploy filter, routes) sits in its command
  handler, and running it in process is a separate change (below).
- **No window where the two sides differ.** Vercel supplies `CRON_SECRET` to the function and sends the same value from the cron
  call of that deployment, so a deployment holds one value. Not verified against Vercel; the first rotation is watched.
- **Dry run and consent.** `--dry-run` prints what it would do and writes nothing, not even the file; it asks first unless
  `--yes`; no terminal and no `--yes` is a `NonInteractiveError`.
- **`--target github` with `--generate`** is allowed for a name in the table (a repository or environment secret made from a
  fresh value); the value is not shown, so it cannot be copied anywhere else. The row says so.

## Not decided, left for later

- Scheduled rotation. The CLI cannot write the vault, so a schedule could only open a reminder; none is built.
- Rotating a signing secret that a vendor also holds (a webhook secret): the vendor's copy has to change in the same step, which
  is a plugin method, not a table row. They stay out of `GENERATED_SECRETS` until that exists.
- A vault that can be written (Doppler, Infisical): `--target` could name them later.
- `--sync`: running `sync secrets` for the same Environment after a checked import. It needs the sync handler's wiring moved
  into a function both can call.

## Verification

Unit tests over an injected IO (random source, file, vault): the table refuses an unknown name, the value is the
declared length and encoding and appears in no printed or logged text, an existing file is never overwritten, an ignored
check failure writes nothing, an unchanged or blank value after the wait fails, a skipped read is a skip, the closing rows name the sync
and the redeploy, `--dry-run` writes nothing. Not verified against a live 1Password Environment or Vercel; the
maintainer runs the first rotation.

## Rollout, in small stacked pull requests

1. This spec.
2. `new secret --target`, `--generate` and `--env`: the table, the hand-off, the check, tests and docs
   (`docs/src/content/docs/commands/`, `AGENTS.md`).
