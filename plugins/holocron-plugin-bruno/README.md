# `@theholocron/holocron-plugin-bruno`

Bruno plugin for [Holocron](../../cli/cli). Implements the `tooling` capability over files: `holocron export requests`
writes the repo's request collections as Bruno JSON files, which Bruno imports. Bruno has no HTTP API and no account
to sync to, so there is no token and no network call.

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-bruno

```

## Config

<!-- prettier-ignore -->
```ts
providers: {
  tooling: [
    ["bruno", {
      collectionFiles: ["api/webhook.collection.json"],
      envFiles: ["api/webhook.environment.json"],
    }],
  ],
},
```

### Options

| Option            | Required | Description                                                                                                                               |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceName`   | No       | The name Bruno shows for the `.bruno/` workspace `sync requests` keeps (default `Workspace`).                                             |
| `version`         | No       | The `info.version` each collection's `opencollection.yml` gets when `sync requests` writes it (default: the root `package.json` version). |
| `collectionFiles` | Yes      | The collection JSON files (v2.1), relative to the repo root. Each becomes one JSON file.                                                  |
| `envFiles`        | No       | The environment JSON files, relative to the repo root. A collection holds the ones in its own folder (all when none is there).            |

## What it does

- `export` converts each collection with Bruno's collection reader (`@usebruno/converters`, which rewrites `pm.*` scripts to
  `bru.*` / `req.*`) and writes `<name>.bruno.json` under the folder it is given (`api/webhook.collection.json` is
  `webhook.bruno.json`): Bruno's own collection export with the environments inside, a secret-type variable marked
  `secret`. It is the file to import in Bruno (one file for the requests and the environments). Bruno rejected the
  OpenCollection YAML this plugin once wrote, so it no longer does.
  Converter issues are returned, not thrown. A dry run converts and writes nothing.
- `workspace` keeps the committed `.bruno/` workspace and the request files in step, both ways (`holocron sync requests`), with Bruno's own
  file writer (`@usebruno/filestore`) and reader (`parseRequest`, `parseFolder`, `parseCollection`, `parseEnvironment`):
  `workspace.yml` (made when missing; when it lacks a collection only that entry is added to its `collections:` list, so the
  `docs`, `specs` and the other settings Bruno keeps there stay as they are), and one folder per collection under `collections/` holding `opencollection.yml`, a `folder.yml` per folder,
  a YAML file per request and an `environments/` folder. Each collection's `opencollection.yml` carries an `info.version`, the root package's version (or the `version` option), written whenever a run that is not a dry run or a check writes the file. It is left out of every comparison and hash, so a release never makes a file out of date or the check fail; it can lag a release behind until the next `sync requests`. A secret variable is written without its value. `.bruno/.sync.json`
  records a hash of both sides of each pair at the last sync, so a run knows which side changed: the request file only
  regenerates the workspace, the workspace only regenerates the request file (through `brunoToPostman`, with the request
  file's untouched entries kept as they were), both is a `conflict` that writes nothing unless `prefer` (`source` or
  `workspace`) settles it. A setting only Bruno has stays in the workspace and is reported as an issue. Each file is `new`,
  `changed`, `unchanged`, `removed` or `conflict`; a dry run writes and deletes nothing. The workspace's docs are one more
  pair (kind `docs`): `.bruno/README.md` (`source`) and the `docs` value of `workspace.yml` (`workspace`), compared as text
  with line endings and the trailing newline ignored, synced by the same rules, and only that value of `workspace.yml` is
  written.
- `sync` does nothing and succeeds: Bruno keeps no state, and the files are written by `export` and `workspace`.
- `doctor` checks `collectionFiles` is set and every file exists and parses as JSON.

## Documentation

See the [plugin page](https://docs.theholocron.dev/holocron/plugins/bruno/).
