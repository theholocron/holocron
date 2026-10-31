# `@theholocron/pkg-utils`

Read `package.json`, list its dependencies and detect the package manager.

## Installation

```bash
pnpm add @theholocron/pkg-utils
```

## Usage

```typescript
import { dependencyNames, detectPackageManager, readPackageJson } from "@theholocron/pkg-utils";

const pkg = await readPackageJson(process.cwd()); // undefined if missing or invalid
dependencyNames(pkg).has("tsdown"); // declared in dependencies or devDependencies?
detectPackageManager(process.cwd()); // "pnpm" | "npm" | "yarn" | "bun"
```

### `readPackageJson(dir)` / `readPackageJsonSync(dir, options?)`

The parsed `<dir>/package.json`, or `undefined` when it is missing, unreadable or
not a JSON object — never a throw. `options.readFile` (sync only) replaces the
file read, for callers with an injected or in-memory filesystem.

### `parsePackageJson(text)`

Parses `package.json` text, ignoring a leading byte-order mark. `undefined` for
broken JSON or JSON that isn't an object. The fields `PackageJson` types are
checked: one of the wrong type is left out, and the string-map fields (`scripts`,
and the dependency maps) keep only their string-valued entries.

### `dependencyNames(pkg, fields?)`

Every package name declared in `pkg`'s `dependencies` and `devDependencies` (or
the `fields` you pass: also `peerDependencies`, `optionalDependencies`), as a
`Set`. An absent `pkg` or missing map contributes nothing.

### `detectPackageManager(dir, options?)`

The name in `package.json#packageManager` (`pnpm@10.0.0` → `pnpm`) when it is
pnpm, npm, yarn or bun, else the first lockfile found (`pnpm-lock.yaml`,
`bun.lockb`/`bun.lock`, `yarn.lock`, `npm-shrinkwrap.json`/`package-lock.json`), else `options.fallback`
(default `"pnpm"`). `options.readFile` and `options.fileExists` replace the disk
access.

### `listWorkspacePackagesSync(repoRoot, options?)`

Every package directly under the workspace roots of `repoRoot` that has a
readable `package.json` holding a JSON object, as `{ name, dir, relativeDir,
manifest }` — roots in the order given, packages within a root sorted by
directory name. A missing root, and a directory without a usable manifest,
contribute nothing. Nothing is filtered by `name`, `version` or `private`: that
is the caller's call. `options.roots` (default `["packages", "plugins"]`) names
the directories to scan, each inside `repoRoot` (a `TypeError` otherwise); `options.readFile` and `options.listDirs` replace the
disk access. A listing error other than "not there" throws. `dir` is always absolute. A single-package repo has no roots — use `readPackageJson` on it.

```typescript
import { listWorkspacePackagesSync } from "@theholocron/pkg-utils";

const publishable = listWorkspacePackagesSync(repoRoot).filter((p) => !p.manifest.private && p.name);
```

### `discoverWorkspacePackages(repoRoot, options?)`

Every package the repo's `pnpm-workspace.yaml` declares, as `listWorkspacePackagesSync()` entries — in glob order, packages within a `<dir>/*` glob sorted by name. Two glob forms are understood: `<dir>/*` (each child of `<dir>` with a `package.json`) and a literal directory (that directory is the package). `!pattern` entries drop matching packages, the repo root (`.`) is skipped, and any other glob throws. Without a `pnpm-workspace.yaml`, or one with no `packages:`, `DEFAULT_WORKSPACE_ROOTS` (`packages`, `apps`, `plugins`) are scanned. `options.group` keeps one version group's folder, `options.excludeGroups` leaves some out, and `options.readText`, `options.readFile` and `options.listDirs` replace the disk access.

```typescript
import { discoverWorkspacePackages } from "@theholocron/pkg-utils";

const names = discoverWorkspacePackages(repoRoot, { group: "clients" }).map((p) => p.name);
```

### `resolveWorkspaceGlobs(repoRoot, options?)` and `readWorkspaceGlobs(yaml)`

`readWorkspaceGlobs` reads the `packages:` list of a `pnpm-workspace.yaml` text into `{ include, exclude }` (a line-based read, not a YAML parse; quotes and trailing comments are stripped). `resolveWorkspaceGlobs` reads the file in `repoRoot` and falls back to the default roots as `<root>/*` when it lists none.

### `parseCatalogs(text)`

The `catalog:` and `catalogs:` blocks of a `pnpm-workspace.yaml` as `{ default: {...}, <name>: {...} }`, package name to range. A line-based read of the flat format pnpm writes; entries outside a catalog are ignored.

### `addWorkspaceMember(workspaceYaml, member)`

Adds `member` (for example `"."`) as the first quoted entry of the `packages:` list and returns `{ content, changed }`. A line-based edit that only adds a line, so the `catalog:` and `overrides:` blocks after it keep their formatting. Nothing changes when the member is already listed, or when there is no plain block-list `packages:`.

### `bumpCatalogPins(content, fetchLatest, options?)`

Rewrites the pins of every catalog entry to the latest version `fetchLatest(name)` returns, keeping the range prefix (`^`, `~`) and the quoting. It never downgrades, leaves a package with no answer alone, and asks once per package. `options.include` limits which packages are looked up. Returns `{ content, bumps }`. `gt(a, b)` is the comparison it uses for `x.y.z` release versions.

### `PackageJson`

The fields these helpers read, typed; any other field passes through untyped.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/holocron/utils/pkg-utils/) for more information.
