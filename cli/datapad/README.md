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

### `loadConfigFile<T>({ cwd, name, extensions?, walkUp? })`

Loads the first `<name>.config.<ext>` found starting at `cwd`. Probe order
is **TS-first** — `.ts` → `.js` → `.mjs` → `.cjs` → `.json` — overridable
via `extensions`. Returns `{ config, filepath } | null`. `null` means "no
such file anywhere searched"; a file that exists but cannot be parsed /
loaded / has no default export throws `ConfigFileError`.

`walkUp: true` (off by default) adds the "nearest config" search
`cosmiconfig`/`postcss`/`stylelint`/ESLint's flat config all do: when `cwd`
has no match, check its parent, then its parent's parent, and so on —
stopping at the first directory containing a `.git` entry (that directory
is still searched before stopping) or the filesystem root. Never wanders
past a repo boundary into an unrelated enclosing directory. `loadLayered`
passes its own `walkUp` through to both the dedicated-file and
fallback-file lookups. Built on `@theholocron/fs-utils`'s generic
`findUpward`/`hasGitEntry` — not reimplemented here.

### `loadConfigFromContent<T>({ dir, content, name, extension })`

Loads config from content that didn't come from a file already on disk —
writes it to `<dir>/<name>.config.<extension>` first, then loads it through
the exact same internals `loadConfigFile` uses for a file it discovered
itself. `dir` matters: it's what upward `node_modules` resolution sees, so
content that does `import { defineConfig } from "@theholocron/cli"` only
resolves if `dir` sits under a tree where that package is a real
dependency — [`withConfigSandbox`](#withconfigsandbox-nodemodules-root-prefix--run) prepares
one. Callers own creating and cleaning up `dir`. Returns
`{ config, filepath }`; throws `ConfigFileError` the same way
`loadConfigFile` does on a parse/load failure.

Built for `@theholocron/sentinel`'s `validateConfig()` — it fetches a
repo's `holocron.config.*` from GitHub's API, not a local checkout, but
still needs the fetched content to execute as a real module.

### `readConfigSource({ name, fetch, extensions? })`

`loadConfigFile`'s extension probe for a config that lives somewhere other
than the local disk. Asks `fetch(path)` for `<name>.config.<ext>` in
extension-priority order (`fetch` returns the content, or `undefined` when
the file isn't there, and throws for any other failure) and returns the first
hit as `{ path, extension, content }`, or `undefined`. Hand the result to
`loadConfigFromContent`.

### `withConfigSandbox({ nodeModules, root?, prefix? }, run)`

Runs `run(dir)` with a throwaway directory ready to be
`loadConfigFromContent`'s `dir`: `node_modules` symlinked to
`options.nodeModules` (so the config's package imports resolve) and a
`{"type":"module"}` `package.json` (so `tsx` doesn't default the files to
CommonJS and `require()` a pure-ESM dependency). Created under the OS temp dir
by default — read-only deployments can't write inside a package — and removed
afterwards, also when `run` throws.

### `loadLayered<T>({ cwd, name, fallback?, extensions?, walkUp?, coerce? })`

`<name>.config.*` layered over the `[fallback.key]` of
`<fallback.file>.config.*`. Either, both, or neither may be present; the
dedicated file wins on conflict (`vitest`-over-`vite`). Returns
`{ config, filepath, sources } | null` — `sources` lists the absolute
paths actually merged, lowest priority first.

- `fallback.preloaded` — the `<fallback.file>.config.*` the caller has
  already loaded (`null`: looked for, not there), used as is instead of loading
  it again.
- `coerce(raw)` — turns each layer's raw value into the shape being merged
  before the merge (a bare array standing for `{ tasks: [...] }`, say);
  returning `undefined` treats the layer as absent.

### `mergeLayers<T>(layers)`

The merge `loadLayered` uses, for layers loaded some other way: deep-merges
`layers` lowest priority first, skipping `undefined`, and returns a copy — or
`undefined` when there is nothing to merge.

### `mergeConfig<T>(base, override)`

Deep-merge, `vite`-style: plain objects merge recursively, arrays
concatenate (`base` first), `undefined` in `override` is skipped, every
other `override` value replaces `base`. Neither input is mutated. A
re-export of `@theholocron/object-utils`'s `deepMerge` under this
package's established name — the merge logic itself has no awareness of
configs at all, so it lives there instead of being duplicated here.

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

| Script                                  | Description                                 |
| --------------------------------------- | ------------------------------------------- |
| `pnpm run delivery.build`               | Bundle with tsdown                          |
| `pnpm run verification.unitTests`       | Run the vitest suite (always with coverage) |
| `pnpm run verification.typeSafety`      | `tsc --noEmit`                              |
| `pnpm run sourceQuality.staticAnalysis` | ESLint                                      |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://docs.theholocron.dev/holocron/>
