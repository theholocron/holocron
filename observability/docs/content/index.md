---
title: Node Template
description: A modern Node.js library starter template with pre-configured tools, best practices, and CI/CD setup.
sidebar:
  hidden: true
---

`@theholocron/node-template` is an opinionated starter for Node.js libraries. It ships with a full development, testing, and release pipeline ready to go.

## What's Included

| Tool                                                    | Purpose                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| [TypeScript](https://www.typescriptlang.org)            | Type safety via `@theholocron/tsconfig`                |
| [ESLint](https://eslint.org)                            | Linting via `@theholocron/eslint-config`               |
| [Prettier](https://prettier.io)                         | Formatting via `@theholocron/prettier-config`          |
| [Vitest](https://vitest.dev)                            | Testing with coverage via `@theholocron/vitest-config` |
| [semantic-release](https://semantic-release.gitbook.io) | Automated releases                                     |
| [Husky](https://typicode.github.io/husky)               | Git hooks via `@theholocron/lint-staged-config`        |
| Astro + Starlight                                       | Docs site                                              |
| CI/CD                                                   | Reusable workflows from `theholocron/.github`          |

## Getting Started

```bash
npx @theholocron/cli new node my-library \
  --description "My library description" \
  --homepage "https://my-library.example.com" \
  --agent claude
```

See [Getting Started](./getting-started) for the full walkthrough including manual setup and available scripts.

## Quick links

- [Getting started](./getting-started) — scaffold a new project with the Holocron CLI
