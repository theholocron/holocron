---
title: TSConfig
description: TypeScript base configurations for theholocron projects.
---

`@theholocron/tsconfig` provides TypeScript base configurations for the two common project targets used across theholocron repositories.

## Install

```bash
npm i -D @theholocron/tsconfig
```

## Presets

### `node-lts`

For Node.js libraries and tools. Targets the current Node.js LTS release.

```json
{
  "extends": "@theholocron/tsconfig/node-lts"
}
```

### `nextjs`

For Next.js apps. Extends the Next.js recommended TypeScript configuration.

```json
{
  "extends": "@theholocron/tsconfig/nextjs"
}
```
