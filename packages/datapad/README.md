# `@theholocron/datapad`

Generic config-file loading for Holocron. Discover `<name>.config.*`, load
it (JSON / JS / TS / ESM / CJS — typed configs via [`tsx`](https://tsx.is),
no build step), layer a dedicated file over a key of a parent file,
deep-merge, and hand back a plain object.

Holocron-agnostic: no schema, no validation, no defaults. Consumers
(`@theholocron/cli` for `holocron.config.*`, `@theholocron/astromech` for
`astromech.config.*`) build those on top.

> A datapad is a handheld device for reading and holding data. This reads
> and holds config files.

## Installation

```sh
pnpm add @theholocron/datapad
```

## Usage

```ts
import { loadConfigFile, loadLayered, mergeConfig, createDefineConfig } from "@theholocron/datapad";

// one file: holocron.config.{ts,js,mjs,cjs,json}
const found = await loadConfigFile<MyConfig>({ cwd, name: "holocron" });
// → { config, filepath } | null

// a dedicated file layered over the `tasks` key of a parent file
const layered = await loadLayered<TasksConfig>({
  cwd,
  name: "astromech",
  fallback: { file: "holocron", key: "tasks" },
});
// → { config, filepath, sources } | null   (dedicated wins on conflict)

const merged = mergeConfig(defaults, layered?.config); // vite-style deep merge

// a typed identity defineConfig for a specific shape
export const defineConfig = createDefineConfig<TasksConfig>();
```

## API

### `loadConfigFile<T>({ cwd, name, extensions? })`

Loads the first `<name>.config.<ext>` found in `cwd`. Probe order is
**TS-first** — `.ts` → `.js` → `.mjs` → `.cjs` → `.json` — overridable via
`extensions`. Returns `{ config, filepath } | null`. `null` means "no such
file"; a file that exists but cannot be parsed / loaded / has no default
export throws `ConfigFileError`.

### `loadLayered<T>({ cwd, name, fallback?, extensions? })`

`<name>.config.*` layered over the `[fallback.key]` of
`<fallback.file>.config.*`. Either, both, or neither may be present; the
dedicated file wins on conflict (`vitest`-over-`vite`). Returns
`{ config, filepath, sources } | null` — `sources` lists the absolute
paths actually merged, lowest priority first.

### `mergeConfig<T>(base, override)`

Deep-merge, `vite`-style: plain objects merge recursively, arrays
concatenate (`base` first), `undefined` in `override` is skipped, every
other `override` value replaces `base`. Neither input is mutated.

### `createDefineConfig<T>()`

Returns a typed identity function — call once per config shape and
re-export it so config files get autocomplete with zero runtime cost.

### `ConfigFileError`

Thrown when a file is found but unusable. Carries the offending
`filepath`. "Not found" is `null`, never an error.

## TypeScript configs

`.ts` files load through `tsx`'s ESM loader, registered once per process
on first use. A single run may load several TS configs (`loadLayered`
reads a dedicated file _and_ a parent file), so the persistent
`register()` is used rather than the one-off `tsImport()`.

## Development

| Script               | Description             |
| -------------------- | ----------------------- |
| `pnpm build`         | Bundle with tsdown      |
| `pnpm test`          | Run the vitest suite    |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm typecheck`     | `tsc --noEmit`          |
| `pnpm lint`          | ESLint                  |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://theholocron.github.io/holocron/>
