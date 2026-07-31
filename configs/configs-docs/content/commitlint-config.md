---
title: CommitLint Config
description: CommitLint rules for Conventional Commits used across theholocron projects.
---

`@theholocron/commitlint-config` enforces the [Conventional Commits](https://www.conventionalcommits.org/) specification used in all theholocron repositories.

## Install

```bash
npm i -D @theholocron/commitlint-config
```

## Usage

In `commitlint.config.ts`:

```ts
import config from "@theholocron/commitlint-config";

export default config;
```

## Allowed types

`feat`, `fix`, `perf`, `refactor`, `docs`, `chore`, `ci`, `test`, `revert`

All commits must use one of these types. The `feat` and `fix` types trigger a version release when used with semantic-release.
