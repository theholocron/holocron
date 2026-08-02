---
title: ESLint Config
description: Composable ESLint configurations and bundles for theholocron projects.
---

`@theholocron/eslint-config` exports a family of composable ESLint configs and pre-built bundles. It uses the flat config format (`eslint.config.ts`).

## Install

```bash
pnpm add -D @theholocron/eslint-config eslint
```

## Configs

Each config is a function that returns a `Linter.Config[]` array and can be spread into any flat config file.

| Export         | Peer deps                                                   | Use for           |
| -------------- | ----------------------------------------------------------- | ----------------- |
| `base()`       | `@eslint/js`, `eslint-plugin-simple-import-sort`, `globals` | All projects      |
| `typescript()` | `typescript-eslint`                                         | TypeScript        |
| `react()`      | `eslint-plugin-react`                                       | React             |
| `node()`       | `eslint-plugin-n`                                           | Node.js           |
| `vitest()`     | `@vitest/eslint-plugin`                                     | Vitest test files |
| `storybook()`  | `eslint-plugin-storybook`                                   | Storybook stories |
| `cypress()`    | `eslint-plugin-cypress`                                     | Cypress tests     |
| `next()`       | `@next/eslint-plugin-next`                                  | Next.js apps      |

## Bundles

Pre-composed sets for common project types:

| Export              | Includes                                            |
| ------------------- | --------------------------------------------------- |
| `bundles/library`   | `base` + `typescript` + `node` + `vitest`           |
| `bundles/next-app`  | `base` + `typescript` + `react` + `next` + `vitest` |
| `bundles/react-app` | `base` + `typescript` + `react` + `vitest`          |
| `bundles/node-app`  | `base` + `typescript` + `node` + `vitest`           |

## Usage

```ts
import { library } from "@theholocron/eslint-config/bundles/library";
import type { Linter } from "eslint";

export default [
  ...library(),
  { ignores: ["dist/**"] },
] satisfies Linter.Config[];
```
