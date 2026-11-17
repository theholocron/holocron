---
id: SPEC-0092
status: draft
issue: theholocron/holocron#2276
blocked-by: []
related:
  - theholocron/holocron#2189
  - theholocron/holocron#2172
discussion:
  url: https://discord.com/channels/1303969001822486568/1572049055717261482
---

# A Bruno workspace in the repo, with each API's requests beside its code

## Problem

The request collections of Sentinel and Comlink (#2172) sit in `apps/<app>/requests/`, away from the code they
exercise, and `export requests` (#2189) gives Bruno a one-way copy in a git-ignored folder. Bruno asks where to save an
import, so the copy ends up outside the repo, and an edit made in Bruno is lost on the next export. The requests should
sit next to the API path they exercise, and Bruno should open and save them in the repo.

## Decision

1. **A `.bruno/` workspace at the repo root**, committed: `workspace.yml` and `collections/<name>/` (each collection an
   OpenCollection folder with its `opencollection.yml`, a `folder.yml` per folder, a YAML file per request and an
   `environments/` folder). Bruno opens the repository's `.bruno/` folder as a workspace and saves every edit there. The
   layout is the one Bruno documents for a workspace. The files are written with Bruno's own writer
   (`@usebruno/filestore`), so they are what the app would save. The provider owns the folder and the layout: the CLI
   reaches it through the optional `Tooling.workspace(input)` and knows no tool's name or path.
2. **The Postman-format JSON moves next to the API it exercises**, named for it: `<endpoint>.collection.json` and
   `<endpoint>.environment[.<name>].json`.
   - The folder keeps the name `api` (not `requests`).
   - Sentinel: `apps/sentinel/api/webhook.collection.json`, `webhook.environment.json`, `webhook.environment.dev.json`,
     `webhook.environment.prod.json`, beside `webhook.mjs`.
   - `apps/sentinel/.vercelignore` lists `api/*.json`, so the files are not uploaded with the function. `vercel.json`
     already registers only `api/webhook.mjs` as a function; the ignore file is belt and braces.
   - The `tooling` provider's `collectionFiles` and `envFiles` name the new paths, and the Sentinel and Comlink
     requests tests, the self-adoption test and the docs follow them.
3. **`holocron sync requests [--check] [--prefer source|workspace] [--dry-run] [--yes]`** keeps the two sides equal. It is a
   `workspace` command that reads the same `collectionFiles` / `envFiles` options as `export requests`. It records, for
   each collection and each environment, a hash of both sides as they were at the last sync, in `.bruno/.sync.json`
   (committed, so a fresh clone has the baseline; `{ version: 1, pairs: [{ kind, source, workspace, sourceHash,
workspaceHash }] }`). The request file's hash is the hash of what the workspace can carry of it (the file written
   to Bruno's files and read back, as a key-sorted JSON text); the workspace's is the hash of its own files. A run
   compares each side with that baseline:

   | JSON changed | Bruno changed | What happens                                  |
   | ------------ | ------------- | --------------------------------------------- |
   | no           | no            | nothing                                       |
   | yes          | no            | the Bruno side is regenerated from the JSON   |
   | no           | yes           | the JSON is regenerated from the Bruno side   |
   | yes          | yes           | a conflict: the row fails, nothing is written |

   With no baseline yet, a side that does not exist is made from the other; two that differ are a conflict. `--prefer`
   settles a conflict explicitly, one run at a time (`source` regenerates the workspace from the request files,
   `workspace` the request files from the workspace; the words are the provider-neutral ones, since the CLI names no
   tool); there is no default winner. Two sides that both changed to the same content are not a conflict. `--check` writes nothing and exits
   non-zero unless every pair is in sync, for CI. `--dry-run` converts and lists. It asks first unless `--dry-run` or
   `--yes`.

4. **Lossy conversion is reported, never hidden.** A field one format cannot hold (a Bruno-only setting going to
   Postman JSON) is a line under the row, as `export` does today, and stays in the Bruno files; the comparison ignores
   what the other format cannot carry, so a Bruno-only edit does not look like a change to the JSON.
5. **Environments** are `.bruno/collections/<name>/environments/<name>.yml`, inside the collection they belong to and
   generated from the `environment*.json` files beside its collection file (all of them when none sits there), so one
   app's workspace never lists another app's environments. A workspace-level `environments/` folder would be shared by
   every collection. A secret-type variable is written without its value in both.
6. **`export requests`** stays for Postman. The Bruno provider's OpenCollection YAML output (which Bruno does not accept) and
   its `@opencollection/converters` / `js-yaml` dependencies go in the last part, once the workspace replaces them.
7. **A version in `info.version`** is not committed: the apps are `0.0.0` and the release version changes on every
   release, which would make every release commit change a generated file. The stamp stays an export-time option if
   it is wanted.

## Out of scope

- Pushing to Postman (`sync tooling`).
- Authoring requests for an app that has none.

## Parts (one PR each)

1. The `.bruno/` workspace and `sync requests` one way (JSON to Bruno), with `--check`. Delivered.
2. Bruno to JSON, the baseline file and conflict detection. Built (#2286).
3. The file moves (`apps/sentinel/api`, Comlink) with `.vercelignore`, and the removal of the YAML output. Delivered:
   the move and `.vercelignore` in one commit, the removal of the OpenCollection YAML output (and its
   `@opencollection/converters` and `js-yaml` dependencies) in a second, separate commit that can be dropped. The
   folder name stays `api`. The default export folder follows the files (`api/.export/`, git-ignored by
   `**/api/.export/`), and an export's output name leaves a `.collection` part out (`webhook.collection.json` is
   `webhook.bruno.json`). The workspace pairs each collection with the environments in its own folder, so Sentinel
   (`api/webhook.*`) and Comlink (`src/worker.*`) still get only their own.

## Open questions

- **Comlink's place (settled).** It has no `api/` code: its one entry is `src/worker.ts`. The files sit beside it,
  `apps/comlink/src/worker.collection.json` and `worker.environment.json` (they were first in an `api/` folder that
  held nothing else), so each app keeps its requests next to the code they exercise. The default export folder
  is `src/.export/`, git-ignored by `**/src/.export/`.
- **Collections outside the workspace folder.** Part 1 puts the collections under `.bruno/collections/`, the layout
  Bruno documents. Whether a workspace can point at a folder outside `.bruno/` is not verified.
- **Round-trip fidelity (checked in part 2).** `@usebruno/converters` has `brunoToPostman`, and `@usebruno/filestore`
  reads every file kind (`parseRequest`, `parseFolder`, `parseCollection`, `parseEnvironment`, `{ format: "yml" }`).
  On the committed Sentinel and Comlink collections the trip request file to Bruno files and back keeps the folder
  structure and order, each request's method, URL, headers, body, description and tests, the folder-level signing
  script (`bru.*` back to `pm.*`), the collection and request descriptions, the collection variables, and an
  environment's secret variable with no value. It is not byte for byte: the translator lays scripts out its own way
  (`pm.response.to.have.status(200)` returns as `pm.expect(pm.response.code).to.equal(200)`, a one-line
  `pm.request.headers.upsert({...})` on four lines), and the exporter drops a folder's description, invents a
  `$guid` collection variable and adds empty `description`, `disabled`, `type`, `packages` and `requests` to every
  entry. Part 2 repairs the first two, removes the last, and lays the original under the result so that only an
  entry the edit changed is rewritten (a request edited in Bruno gets its test rewritten as above; the others keep
  their text). Writing the Bruno files again from that result gives the same files, so a second sync changes nothing.
  Not verified: features no committed collection uses (GraphQL, auth modes beyond inherit/none, examples, multipart
  bodies, folder-level auth), which the exporter may not round-trip.
- **A Bruno-only edit and a request file change at once.** The workspace's hash covers its own files whole, so an edit
  to a setting only Bruno has (a timeout) is still a change to the workspace; if the request file changed as well,
  that is a conflict, and `--prefer source` drops the setting. Hashing only what the request file carries would make
  the sync overwrite such settings without saying so.
- **`workspace.yml` is the app's, not only ours.** Bruno keeps its own settings in it (the workspace `docs`, `specs`,
  the active environment). The sync makes the file when it is missing, leaves it alone while it lists every
  collection, and otherwise inserts only the missing `collections:` entries (also from `collections: []`) with every
  other byte kept; it makes the file whole only when there is no `collections:` key at all.
- **The workspace docs are synced both ways (decided).** The text people read first lives in `.bruno/README.md`
  (markdown, shown by GitHub) and in the `docs` field of `workspace.yml` (what Bruno edits). They are one more baseline
  pair (kind `docs`, `source` the README, `workspace` Bruno's docs), compared as normalized text (line endings and the
  trailing newline ignored), with the same table, `--prefer` and `--check` as the requests; only the `docs` value of
  `workspace.yml` is written, and empty docs count as missing. The README is ignored by Prettier, because a formatter
  would otherwise read as an edit.
- **A renamed environment file.** An environment's workspace file name comes from its name in the request file; a file
  renamed in Bruno is read as a new, unsynced file and the old one is regenerated. Not handled.
- **`validate:generated`.** Whether `sync requests --check` joins that task or gets its own. Part 1 pins the committed
  `.bruno/` with a unit test in the Bruno plugin (`committed-workspace.test.ts`), which the required `test:unit` check runs.
