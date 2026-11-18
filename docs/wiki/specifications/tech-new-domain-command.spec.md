---
id: SPEC-0095
status: accepted
issue: theholocron/holocron#2352
blocked-by: []
related:
  - theholocron/holocron#2346
  - theholocron/holocron#2302
discussion:
  url: https://discord.com/channels/1303969001822486568/1572487596875980930
---

# `holocron new domain`: take a DNS record, make it, keep it

## Problem

A vendor that serves a hostname of ours asks for DNS records: a CNAME to its edge and a TXT that proves we own the name.
Some vendors return them from their API (a Checkly status page does), and `setup` makes those. Others do not: a Checkly
dashboard's domain is verified in the vendor's UI and the API has no verification endpoint for it, so the person copies
the values into Cloudflare by hand and nothing in the repo remembers what was made. `status.theholocron.dev` had no
DNS at all until someone noticed the page did not load. The same will happen at every other vendor that works this way.

## Design

### The command

`holocron new domain [--type CNAME|TXT|A|AAAA] [--name <host>] [--value <content>] [--note <text>] [--proxied] [--dry-run] [--yes]`.

- **Provider-neutral.** It calls the `dns` capability (`upsertRecord`); Cloudflare is the provider today and the
  command names none. It is a `workspace` command (`assertPluginsResolvable`), like `new tunnel`.
- **Input.** Flags first; on a terminal a missing flag is prompted; without one a missing flag is a `NonInteractiveError`
  (the `promptForOptions` pattern the other `new` commands use). `--name` is the full hostname and must sit under the
  org's `domain`; `--type` is validated against the capability's `DnsRecordType`.
- **DNS only by default.** A vendor reads the record itself to verify the name, and a proxy would answer in its place.
  `--proxied` opts in, and only means something to a provider that has a proxy.
- **Order.** It reads the zone, shows the change (new, already right, or a different value it would replace), asks first
  unless `--yes` or `--dry-run`, makes the record, then adds it to the list. `--dry-run` writes neither.
- **Never deletes.** A record the list no longer holds stays in the zone.

### The list

`.holocron/dns-records.json`, one array of `{ type, name, value, note?, proxied? }`. JSON, not TypeScript, so the
command can rewrite it safely; the values are public DNS data and no secret goes in it. It is not an area file
(`HOLOCRON_AREAS` stays closed) and not a config key: the CLI reads it from the repository root by its name, as it reads
`.holocron/projects/<name>.json`, so the config does not change. A record is keyed by type and name; adding
one that exists replaces its value and note in the file (the command says so).

### Applying and checking

- `holocron setup` re-applies the whole list through the `dns` provider (an upsert, so a record that is right is left
  alone), so a new zone or a lost record comes back with one command. With no `dns` provider each record is a failing
  `todo` row naming what to make. `--dry-run` writes nothing. The step is `dnsRecordsStep()`.
- `holocron doctor dns` expects each listed record in its zone's row, with its type, name and value (TXT quotes, case and a
  trailing dot ignored), beside the records the config already makes `setup` write. Read-only. A list that cannot be
  read is a failing row of its own.
- The `monitoring` dashboard's `dnsRecords` (#2347) is removed: the dashboard's records are entries in the list, with a
  `note` saying which dashboard they serve. `doctor monitoring` keeps no DNS row of its own.

## Choices to review

1. **One shared list, applied by `setup`** (chosen) against a data file per resource or no stored list. One list means one
   step and one doctor row for every vendor; the cost is that a record has no owner except its `note`.
2. **JSON, not a `.ts` data file.** The command rewrites the file; a TypeScript file would have to be parsed or
   regenerated.
3. **The list is the source of truth, the zone is the copy.** A record changed by hand in the zone is put back by the
   next `setup`, and `doctor dns` names it first.
4. **No `delete`.** Removing an entry stops managing the record; the person deletes it in the zone.

## Out of scope

Reading records from a vendor's API (a status page's records still come from Checkly), MX and SRV records (they take a
priority the input does not carry), and a command to list or remove entries.

## Tests and docs

Unit tests for the flag and prompt handling, the change preview, the dry run, the list rewrite (add, replace, keep
order) and the `setup` and `doctor dns` rows; docs in `docs/src/content/docs/commands/` and `AGENTS.md`.
