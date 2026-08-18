---
title: Configs
description: Shareable tool configurations for ESLint, Prettier, TypeScript, Vitest, and more — used across all theholocron projects.
sidebar:
  hidden: true
---

`@theholocron/configs` is a pnpm monorepo of shareable tool configurations used across every `theholocron` project. Install only what you need — each package is published independently.

## Packages

| Package                                                             | Description                                        |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| [`@theholocron/browserslist-config`](./browserslist-config)         | Browserslist target browser list                   |
| [`@theholocron/commitlint-config`](./commitlint-config)             | CommitLint rules for Conventional Commits          |
| [`@theholocron/devmoji-config`](./devmoji-config)                   | Devmoji emoji mappings for conventional commits    |
| [`@theholocron/eslint-config`](./eslint-config)                     | ESLint configs and bundles                         |
| [`@theholocron/holocron-config`](./holocron-config)                 | Shareable Holocron CLI presets                     |
| [`@theholocron/lint-staged-config`](./lint-staged-config)           | Lint-staged hooks configuration                    |
| [`@theholocron/prettier-config`](./prettier-config)                 | Prettier formatting rules                          |
| [`@theholocron/semantic-release-config`](./semantic-release-config) | semantic-release factory with Conventional Commits |
| [`@theholocron/storybook-config`](./storybook-config)               | Storybook main and preview configuration           |
| [`@theholocron/stylelint-config`](./stylelint-config)               | Stylelint CSS rules                                |
| [`@theholocron/tsconfig`](./tsconfig)                               | TypeScript base configurations                     |
| [`@theholocron/tsdown-config`](./tsdown-config)                     | tsdown build presets                               |
| [`@theholocron/vite-config`](./vite-config)                         | Vite configuration presets                         |
| [`@theholocron/vitest-config`](./vitest-config)                     | Vitest configuration presets                       |

## Install

Each package is published independently to npm:

```bash
pnpm add -D @theholocron/eslint-config
```

All packages follow the same lockstep versioning — see the
[releases page](https://github.com/theholocron/configs/releases) for the current version.
