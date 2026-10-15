# `@theholocron/fs-utils`

Walk a directory tree upward to find the nearest match or project root.

## Installation

```bash
pnpm add @theholocron/fs-utils
```

## Usage

```typescript
import { findExecutable, findExecutableSync, findRoot, findUpward, hasGitEntry } from "@theholocron/fs-utils";

// nearest ancestor holding a marker file or directory
const repoRoot = await findRoot(process.cwd(), ".git");
const monorepoRoot = await findRoot(process.cwd(), ["pnpm-workspace.yaml", "turbo.json"]);

// find the nearest ancestor holding a config file, stopping at the repo root
const configDir = await findUpward(
  process.cwd(),
  async (dir) => ((await fileExists(join(dir, "app.config.json"))) ? dir : undefined),
  hasGitEntry
);

// a plain boundary check, usable as `findUpward`'s `stop` or on its own
await hasGitEntry("/path/to/dir"); // true if a .git entry (file or folder) exists there
```

### `findUpward(startDir, check, stop?)`

Walks upward from `startDir` — itself first, then its parent, and so on —
calling `check(dir)` at each directory and returning the first result
that isn't `undefined`. When given, `stop(dir)` is checked only after
`check` has already come back empty for that directory (so it's still
fully checked before stopping) — returning `true` ends the walk there
with no result, instead of continuing to the parent. Without `stop`,
walks all the way to the filesystem root. Always terminates: directory
nesting is finite.

### `findRoot(startDir, marker, options?)` / `findRootSync(...)`

The nearest ancestor of `startDir` — itself first — that contains `marker`: a
file or directory name, or a list of names where any one counts. Resolves to
`undefined` when nothing is found. `findRootSync` is the synchronous twin.
Each marker must be a bare name — an empty string, `.`, `..` or anything with a
path separator throws a `TypeError`, as does any filesystem error other than
"not there" (e.g. `EACCES`). A relative `startDir` is resolved against the
working directory up front, so results are always absolute.

- `options.fallback: "start"` — return the start directory instead of
  `undefined` when nothing is found (a soft-skip for callers that treat the
  start dir as the root anyway; always absolute).
- `options.realpath: true` — resolve symlinks of `startDir` before
  walking, so a symlinked start walks the physical tree instead of the link's
  own ancestors. A start path that doesn't exist
  counts as not found.

```typescript
// a git root that never throws and never returns undefined
const root = findRootSync(cwd, ".git", { fallback: "start", realpath: true });
```

### `findExecutable(bin, options?)` / `findExecutableSync(...)`

The first runnable file named `bin` on `options.path` (default `process.env.PATH`),
or `undefined` — a `which`. Directories and files without the exec bit don't
count. `bin` must be a bare command name (an empty string, `.`, `..` or anything
with a path separator throws a `TypeError`), as does any filesystem error other
than "not there" / "not permitted".

- `options.path` — directories to search, delimited like `PATH` on the target
  platform (`:` on POSIX, `;` on Windows). Empty entries are skipped; relative
  ones are resolved against the working directory when the call starts, so
  results are always absolute.
- `options.pathExt` / `options.platform` — on Windows there is no exec bit:
  `bin` is tried with each `PATHEXT` extension (default `.COM;.EXE;.BAT;.CMD`)
  unless it already ends in one. An extension containing a path separator
  throws a `TypeError`.

```typescript
// a project-local binary first, then the real PATH
const tsc = findExecutableSync("tsc", { path: join(cwd, "node_modules", ".bin") }) ?? findExecutableSync("tsc");
```

### `hasGitEntry(dir)`

Returns `true` when `dir` has a `.git` entry — a directory in a normal
checkout, a file in a worktree/submodule (existence is all that matters).
A common `stop` boundary for `findUpward`: treat the nearest `.git` as
the project root, searched but not walked past.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
