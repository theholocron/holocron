# `@theholocron/fs-utils`

Walk a directory tree upward to find the nearest match or project root.

## Installation

```bash
pnpm add @theholocron/fs-utils
```

## Usage

```typescript
import { findUpward, hasGitEntry } from "@theholocron/fs-utils";

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

### `hasGitEntry(dir)`

Returns `true` when `dir` has a `.git` entry — a directory in a normal
checkout, a file in a worktree/submodule (existence is all that matters).
A common `stop` boundary for `findUpward`: treat the nearest `.git` as
the project root, searched but not walked past.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
