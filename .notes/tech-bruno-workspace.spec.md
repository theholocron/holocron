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

1. **A `.bruno/` workspace at the repo root**, committed: `workspace.yml`, `environments/` and `collections/<name>/`
   (each collection an OpenCollection folder with its `opencollection.yml`). Bruno opens the repository's `.bruno/`
   folder as a workspace and saves every edit there. The layout is the one Bruno documents for a workspace.
2. **The Postman-format JSON moves next to the API it exercises**, named for it: `<endpoint>.collection.json` and
   `<endpoint>.environment[.<name>].json`.
   - Sentinel: `apps/sentinel/api/webhook.collection.json`, `webhook.environment.json`, `webhook.environment.dev.json`,
     `webhook.environment.prod.json`, beside `webhook.mjs`.
   - `apps/sentinel/.vercelignore` lists `api/*.json`, so the files are not uploaded with the function. `vercel.json`
     already registers only `api/webhook.mjs` as a function; the ignore file is belt and braces.
   - The `tooling` provider's `collectionFiles` and `envFiles` name the new paths, and the Sentinel and Comlink
     requests tests, the self-adoption test and the docs follow them.
3. **`holocron sync requests [--check] [--prefer json|bruno] [--dry-run] [--yes]`** keeps the two sides equal. It is a
   `workspace` command that reads the same `collectionFiles` / `envFiles` options as `export requests`. It records, for
   each collection and each environment, a hash of both sides as they were at the last sync, in `.bruno/.sync.json`
   (committed, so a fresh clone has the baseline). A run compares each side with that baseline:

   | JSON changed | Bruno changed | What happens                                  |
   | ------------ | ------------- | --------------------------------------------- |
   | no           | no            | nothing                                       |
   | yes          | no            | the Bruno side is regenerated from the JSON   |
   | no           | yes           | the JSON is regenerated from the Bruno side   |
   | yes          | yes           | a conflict: the row fails, nothing is written |

   With no baseline yet, a side that does not exist is made from the other; two that differ are a conflict. `--prefer`
   settles a conflict explicitly, one run at a time; there is no default winner. `--check` writes nothing and exits
   non-zero unless every pair is in sync, for CI. `--dry-run` converts and lists. It asks first unless `--dry-run` or
   `--yes`.

4. **Lossy conversion is reported, never hidden.** A field one format cannot hold (a Bruno-only setting going to
   Postman JSON) is a line under the row, as `export` does today, and stays in the Bruno files; the comparison ignores
   what the other format cannot carry, so a Bruno-only edit does not look like a change to the JSON.
5. **Environments** are `.bruno/environments/<name>.yml`, generated from the `environment*.json` files like the
   collections; a secret-type variable stays empty in both.
6. **`export requests`** stays for Postman. The Bruno provider's OpenCollection YAML output (which Bruno rejects) and
   its `@opencollection/converters` / `js-yaml` dependencies go in the last part, once the workspace replaces them.
7. **A version in `info.version`** is not committed: the apps are `0.0.0` and the release version changes on every
   release, which would make every release commit change a generated file. The stamp stays an export-time option if
   it is wanted.

## Out of scope

- Pushing to Postman (`sync tooling`).
- Authoring requests for an app that has none.

## Parts (one PR each)

1. The `.bruno/` workspace and `sync requests` one way (JSON to Bruno), with `--check`.
2. Bruno to JSON, the baseline file and conflict detection.
3. The file moves (`apps/sentinel/api`, Comlink) with `.vercelignore`, and the removal of the YAML output.

## Open questions

- **Comlink's place.** It has no `api/` folder: its one entry is `src/worker.ts`. Beside it (`src/worker.collection.json`)
  keeps the files next to the code; a new `apps/comlink/api/` would hold nothing else.
- **Collections outside the workspace folder.** Part 1 puts the collections under `.bruno/collections/`, the layout
  Bruno documents. Whether a workspace can point at a folder outside `.bruno/` is not verified.
- **Round-trip fidelity.** Bruno to Postman JSON through `@usebruno/converters` is untested on the signing script and
  on the folder structure; part 2 starts with that check.
- **`validate:generated`.** Whether `sync requests --check` joins that task or gets its own.
