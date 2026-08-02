---
title: Semantic Release Config
description: semantic-release configuration factory with Conventional Commits support.
---

`@theholocron/semantic-release-config` provides `defineConfig` — a factory that produces a complete semantic-release configuration for any theholocron project.

## Install

```bash
pnpm add -D @theholocron/semantic-release-config semantic-release
```

## Usage

In `release.config.ts`:

```ts
import { defineConfig } from "@theholocron/semantic-release-config";

export default defineConfig({
  branches: ["main", { name: "alpha", prerelease: true }],
  exec: {
    prepareCmd: "...",
    publishCmd: "...",
  },
});
```

## Release rules

| Commit type               | Release |
| ------------------------- | ------- |
| `feat`                    | minor   |
| `fix`, `perf`, `refactor` | patch   |
| `chore(deps)`             | patch   |
| Breaking change (`!`)     | major   |

Types `docs`, `chore`, `ci`, `test` do **not** trigger a release.

## Changelog sections

| Type       | Section       | Visible |
| ---------- | ------------- | ------- |
| `feat`     | Features      | ✓       |
| `fix`      | Bug Fixes     | ✓       |
| `perf`     | Performance   | ✓       |
| `refactor` | Refactoring   | ✓       |
| `docs`     | Documentation | ✓       |
| `chore`    | Chores        | ✓       |
| `ci`       | CI            | hidden  |
| `test`     | Tests         | hidden  |
