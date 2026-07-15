# Semantic Release Config

A [semantic-release configuration](https://semantic-release.gitbook.io/semantic-release/usage/configuration) for automated versioning and changelog generation.

## Installation

```bash
pnpm add -D @theholocron/semantic-release-config semantic-release \
  @semantic-release/changelog @semantic-release/commit-analyzer \
  @semantic-release/git @semantic-release/github \
  @semantic-release/release-notes-generator \
  conventional-changelog-conventionalcommits
```

If your repo uses `@semantic-release/exec` for version bumping and publishing, add it too:

```bash
pnpm add -D @semantic-release/exec
```

## Usage

Create a `release.config.js` at your repo root:

```js
import { defineConfig } from "@theholocron/semantic-release-config";

export default defineConfig({
  branches: ["main", { name: "alpha", prerelease: true }],
  exec: {
    prepareCmd: "pnpm exec holocron npm bump-versions ${nextRelease.version}",
    publishCmd:
      "pnpm -r --filter='./packages/*' publish --access public --no-git-checks --tag ${nextRelease.channel || 'latest'}",
  },
});
```

Omit `exec` for repos with a single package (semantic-release handles the version bump and publish natively):

```js
import { defineConfig } from "@theholocron/semantic-release-config";

export default defineConfig();
```

## Options

| Option     | Type                           | Default                                                       | Description                                                                                                                       |
| ---------- | ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `branches` | `Array`                        | `['main']`                                                    | Release branches. See [semantic-release docs](https://semantic-release.gitbook.io/semantic-release/usage/configuration#branches). |
| `exec`     | `{ prepareCmd?, publishCmd? }` | `undefined`                                                   | Commands for `@semantic-release/exec`. Omit if not needed.                                                                        |
| `assets`   | `string[]`                     | `['CHANGELOG.md', 'package.json', 'packages/*/package.json']` | Files committed by `@semantic-release/git` after release.                                                                         |

## Plugin pipeline

The config wires up this fixed plugin order:

1. `@semantic-release/commit-analyzer` — conventional commits with `feat` → minor, `fix`/`perf`/`refactor` → patch, `chore(deps)` → patch
2. `@semantic-release/release-notes-generator` — conventional changelog sections
3. `@semantic-release/changelog` — writes `CHANGELOG.md`
4. `@semantic-release/exec` — repo-specific version bump and publish commands _(only when `exec` is passed)_
5. `@semantic-release/git` — commits updated files back to the repo
6. `@semantic-release/github` — creates a GitHub release

## Named exports

For advanced composition, individual plugin configs are also exported:

```js
import {
  commitAnalyzer,
  releaseNotesGenerator,
} from "@theholocron/semantic-release-config";
```
