---
title: Lint Staged Config
description: Lint-staged hooks configuration for theholocron projects.
---

`@theholocron/lint-staged-config` provides the default lint-staged configuration used across theholocron repositories, running ESLint and Prettier on staged files before each commit.

## Install

```bash
npm i -D @theholocron/lint-staged-config lint-staged
```

## Usage

In `lint-staged.config.ts` (or via `lint-staged` key in `package.json`):

```ts
export { default } from "@theholocron/lint-staged-config";
```

Or in `.husky/pre-commit`:

```sh
pnpm exec lint-staged
```
