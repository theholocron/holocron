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

| Option            | Required | Description                                                                                         |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `collectionFiles` | Yes      | The collection JSON files (v2.1), relative to the repo root. Each becomes one YAML file.            |
| `envFiles`        | No       | The environment JSON files, relative to the repo root. Every exported collection holds all of them. |

## What it does

- `export` converts each collection with Bruno's collection reader (`@usebruno/converters`, which rewrites `pm.*` scripts to
  `bru.*` / `req.*`) and the OpenCollection writer (`@opencollection/converters`), dumped with `js-yaml`, and writes
  `<name>.yml` under the folder it is given. Environments are inside the document; a secret-type variable is marked `transient`.
  Converter issues are returned, not thrown. A dry run converts and writes nothing.
- `sync` does nothing and succeeds: Bruno keeps no state, and the files are written by `export`.
- `doctor` checks `collectionFiles` is set and every file exists and parses as JSON.

## Documentation

See the [plugin page](https://docs.theholocron.dev/holocron/plugins/bruno/).
