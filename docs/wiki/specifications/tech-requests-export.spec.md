---
id: SPEC-0085
status: accepted
issue: theholocron/holocron#2189
blocked-by: []
related:
  - theholocron/holocron#2172
discussion:
  url: https://discord.com/channels/1303969001822486568/1571054704140755016
---

# `export requests`: each tool's format, generated from one JSON source

## Problem

The Sentinel and Comlink request collections (#2172) are one JSON source per app, `apps/<app>/requests/collection.json`
and `environment.json` (moved beside the API in #2276, for example `apps/sentinel/api/webhook.collection.json`). A tool that does not read that format cannot open them: Bruno reads OpenCollection YAML, and
the `postman` tool's git-native format is collection schema 3.0 YAML. The JSON should stay the one source, with each tool's format
generated from it, so no tool's file is edited by hand and none drifts.

## Decision

1. **Capability method.** An optional `export(input)` on the existing `Tooling` interface, like the optional methods on
   `Source` and `Notifications`. No new capability, so no change to `CARDINALITY` or the organization's
   `holocron_capabilities` property. `ToolingExportInput` is `{ collectionFiles, envFiles, outDir, repoRoot, dryRun? }`
   (files relative to `repoRoot`, `outDir` absolute); `ToolingExportResult` is `{ files, issues }` (`files` relative to
   `outDir`, `issues` a list of `{ file, message }`). With `dryRun` the provider converts but writes nothing, and
   `files` lists what would be written. A provider that reads the source format as it is omits `export`.
2. **Command.** `holocron export requests [--to <provider>] [--out <dir>] [--dry-run] [--yes]`, beside `export tokens`.
   It is a `workspace` command. It takes each `tooling` provider's `collectionFiles` and `envFiles` options as the list
   of source files (the same two option names every tooling provider uses for the repo's request files), calls `export`
   on every provider that has it (or only `--to`), and writes to `<out>/<provider>`; `<out>` defaults to `.export`
   beside the collection files (`api/.export/<provider>/` since #2276), which `.gitignore` leaves out; collection files in
   different folders are exported separately, each beside its own folder, and `--out` puts them all in one. It refuses a folder
   that is, or contains, the folder of a source file ("never writes inside the source folder"; a folder below it, the
   default, is allowed). It asks first unless `--dry-run` or `--yes`, and refuses without a terminal. A conversion issue
   is a line under the provider's row and is not a failure; a provider that throws is a failing row, and the run goes on
   with the next one.
3. **Bruno plugin** (`@theholocron/holocron-plugin-bruno`, part 2): `tooling` only, files only (no token, no network).
   Converts with `postmanToBruno` (`@usebruno/converters`) and writes Bruno's own JSON export. (It first also wrote an
   OpenCollection YAML through `@opencollection/converters` and `js-yaml`; Bruno rejects that file, so #2276 removed it
   and both dependencies.) There is no `bruno-client`: Bruno has no HTTP API. Options mirror the other tooling providers'
   (`collectionFiles`, `envFiles`, relative to the repo root). Checked against the real converters on the Sentinel and
   Comlink collections: no issues, and the signing script comes out as `bru.getVar` / `req.setHeader`.
   - **One file per collection**, named after the source (`collection.json` is `collection.bruno.json`, `webhook.collection.json` is `webhook.bruno.json`; two files of the same
     name use their whole path joined with `-`).
   - **Environments live inside the Bruno JSON file** (`environments`), not in a file of their own, so every
     environment file goes into the collections it is handed with: the command gives a folder's collections the
     environment files beside them (all of them when none sits there, or under `--out`). A secret-type
     variable becomes `secret: true`.
   - **`sync()` is a no-op that succeeds.** Bruno holds no state to reconcile, `holocron setup` calls `sync` on every
     tooling provider, and writing files is the person's call through `export`, never a side effect of `setup`.
   - **`doctor()`** reports `collectionFiles` unset, or each collection and environment file that is missing or not JSON.
   - The JSON file imports into the Bruno app (confirmed by hand); the OpenCollection YAML first written here did not.
4. **`postman` plugin** (part 3): `export` writes collection schema 3.0 YAML by running
   `postman collection migrate <file> --output <dir>` through a small CLI-transport wrapper (`shell.ts`: `spawnSync`,
   stdin attached, injected for tests).
   - **One folder per collection** under `outDir`, named after the file (the whole path when two share a name); the files
     written are listed by walking that folder afterwards, because the CLI's layout is not known here.
   - **Environments are not exported**: the command migrates collections only, so each environment file is an issue
     ("not exported"), never a failure.
   - **A dry run** migrates into a temporary folder, lists it and removes it, so `outDir` is never touched.
   - **The CLI is installed by `.humans/setup.sh`** (its own step, `have postman`; `doctor` only reports; macOS with
     Homebrew installs the `postman-cli` cask, anything else gets a hand step), not by the Brewfile, so a machine that
     never exports is not asked for it. The cask name and its `postman` binary were checked with `brew info --cask`.
   - **Unverified against the real CLI**: the arguments follow the vendor's documentation and the wrapper is exercised
     only through an injected runner. A missing CLI is an error that says how to install it.
5. **Names.** The request files keep their tool-neutral names, and prose about them names no tool; the provider id and
   the format's own `info.schema` URL are the only mentions.

## Out of scope

- Importing a tool's own edits back into the JSON. The JSON is the source; an export is read-only output.
- Pushing to an account (`sync` does that for providers that have one).

## Open questions

None for part 1. Parts 2 and 3 record what the real converters and CLI did.
