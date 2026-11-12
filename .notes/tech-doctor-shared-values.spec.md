---
status: draft
issue: theholocron/holocron#2089
blocked-by: []
related:
  - theholocron/holocron#2058
  - theholocron/holocron#2059
  - theholocron/holocron#2063
---

# `doctor shared-values`: find a secret that holds one value in two layers

## Problem

13 tokens held the same value in the `dev` and `ci` Environments (#2059): a leak from CI exposed what a laptop holds.
The only way to see it was a one-off script that hashed the values by hand. After the layers were split, nothing shows
that they stayed split, or that a copy-paste put a value back.

## Decision

A deep, read-only check, `holocron doctor shared-values` (a `DEEP_CHECKS` entry, a `workspace` command, capability
`vault`). It reads the Environments of the four layers of this repository, `<org/repo> - local`, `- dev`, `- ci` and
`- prod` (`layerEnvironment()`, `repoSlug()` and `ENVIRONMENT_LAYERS` from `credentials-environments/`), in memory
through the `vault` provider, and reports by name the secrets that hold the same value in two layers.

- **No fallback.** The `credentials` chain falls back from `local` to `dev`; this check does not, because a fallback is
  one Environment read twice. Each layer is read by its own name.
- **Only concealed entries are compared.** A visible variable is meant to be the same everywhere. `Vault` gets an
  optional `readEnvironmentEntries(environmentId)` returning `{ name, value, concealed }`; `readEnvironment` is
  unchanged. The 1Password plugin implements it with `op environment secret list --reveal --format=json`. A vault
  without it is read with `readEnvironment`, every entry is compared, and a skipped row says so; the allow-list is then
  how a visible value is left out.
- **Salted hash, never printed.** Each value becomes an HMAC under a salt made fresh for the run (`compareLayers()`).
  Digests live in two maps for the length of the call; the result is names. No value, hash or length reaches the
  output, a log or an error. An error text from the vault has every value read so far taken out of it. An empty value
  is ignored. The same value under two names counts and is shown as `LATER = EARLIER`.
- **One row per pair of layers**, in `local, dev, ci, prod` order: `ci = dev`, with `N secrets share a value: A, B`.
  A pair with a shared secret is an `info` row (shown as skipped) and the exit stays 0; `--strict` makes it a failure.
  A pair with nothing shared is an `ok` row. A line counts pairs and shared names, then the usual summary.
  The detail names both layers (`2 secrets share a value between dev and ci: A, B`), so the owner can tell which App or
  service the value belongs to.
- **Variables that drift between `ci` and `dev`.** The organization's constants live in `ci` and have a copy in `dev`,
  with no fallback between layers (#2058). The visible (unconcealed) entries of the two are compared by name: a row
  `variables missing from dev, present in ci` and a row `variables differ between ci and dev`, each only when it has
  names, always `info` (a `dev` value may differ on purpose; `--strict` does not apply). Identical variables add no row.
  Values are compared in memory and dropped, and only names are printed. The allow-list applies. The closing line also
  counts the drifting variables.
- **A layer that cannot be read** is a skipped row naming its Environment and why. `local` is optional: a missing or
  unreadable one is silent. With fewer than two readable layers a row says there is nothing to compare.
- **Shared on purpose.** A name is left out when it is in `doctor.sharedVariables` (already declared in
  `holocron.config.ts`, the same list `doctor variable-owners` reads, so no new key and no growth of that file) or
  passed with `--allow NAME` (repeatable). Case is ignored; either name of a differently named pair is enough.
- `--post` is not offered. `doctor --all` runs it with the defaults (not strict).

## Open questions

1. **The shape of `op ... --format=json`** is not checked here (no `op` was run). The parser reads an array, or
   an object holding one, of entries with `name` (else `key`), `value` and a boolean `concealed`, and counts an entry
   whose flag is not `false` as concealed. A maintainer should confirm it against the real output before relying on the
   check.
2. **One allow-list or two.** `doctor.sharedVariables` means "this name lives in more than one place on purpose", which
   is also what this check needs, so it is reused. If a name should be allowed in one check and not the other, a
   separate `doctor.sharedValues` key is the change.
3. **Variable drift is `ci` against `dev` only.** Comparing every pair would make `prod`, which holds app-specific
   variables, report most of its names as missing. If `local` against `dev`, or `prod`, should be compared too, say
   which pairs.
4. **Unreadable `local` is silent**, whatever the reason, because a missing Environment and a read that errors look the same
   through `readEnvironment`.
