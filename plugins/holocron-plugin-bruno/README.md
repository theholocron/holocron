# `@theholocron/holocron-plugin-bruno`

Bruno plugin for [Holocron](../../cli/cli). Implements the `tooling` capability over files: `holocron export requests`
writes the repo's request collections as OpenCollection YAML, which Bruno imports. Bruno has no HTTP API and no account
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
      collectionFiles: ["requests/collection.json"],
      envFiles: ["requests/environment.json"],
    }],
  ],
},
```

### Options

| Option            | Required | Description                                                                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `workspaceName`   | No       | The name Bruno shows for the `.bruno/` workspace `sync requests` keeps (default `Workspace`).                                  |
| `collectionFiles` | Yes      | The collection JSON files (v2.1), relative to the repo root. Each becomes one YAML file.                                       |
| `envFiles`        | No       | The environment JSON files, relative to the repo root. A collection holds the ones in its own folder (all when none is there). |

## What it does

- `export` converts each collection with Bruno's collection reader (`@usebruno/converters`, which rewrites `pm.*` scripts to
  `bru.*` / `req.*`) and the OpenCollection writer (`@opencollection/converters`), dumped with `js-yaml`, and writes
  `<name>.yml` under the folder it is given. Environments are inside the document; a secret-type variable is marked `transient`.
  The same collection is also written as `<name>.bruno.json`, Bruno's own collection export with the environments inside,
  which is the file to import in Bruno (one file for the requests and the environments).
  Converter issues are returned, not thrown. A dry run converts and writes nothing.
- `workspace` keeps the committed `.bruno/` workspace equal to the request files (`holocron sync requests`), with Bruno's own
  file writer (`@usebruno/filestore`): `workspace.yml`, and one folder per collection under `collections/` holding
  `opencollection.yml`, a `folder.yml` per folder, a YAML file per request and an `environments/` folder. A secret variable
  is written without its value. Each file is `new`, `changed`, `unchanged` or `removed`; a dry run writes and deletes nothing.
  One way for now: the request files win.
- `sync` does nothing and succeeds: Bruno keeps no state, and the files are written by `export` and `workspace`.
- `doctor` checks `collectionFiles` is set and every file exists and parses as JSON.

## Documentation

See the [plugin page](https://docs.theholocron.dev/holocron/plugins/bruno/).
