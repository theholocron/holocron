---
title: Skills
description: Shared agent skill registry for @theholocron projects.
sidebar:
  hidden: true
---

`@theholocron/skills` is a shared registry of agent skills — reusable, invocable prompts that guide Claude and other agents through repeatable workflows in `@theholocron` repositories.

## Skills

| Skill | Description |
| --- | --- |
| [`commit-standards`](./skills/commit-standards) | Conventional Commits format and DCO signing rules |
| [`git-safety`](./skills/git-safety) | Guard rails for destructive git operations |
| [`holocron-skill-client`](./skills/holocron-skill-client) | Scaffold a new HTTP client package in `theholocron/clients` |
| [`holocron-skill-config`](./skills/holocron-skill-config) | Scaffold a new shareable config package in `theholocron/configs` |
| [`holocron-skill-plugin`](./skills/holocron-skill-plugin) | Scaffold a new `holocron-plugin-*` package |
| [`holocron-skill-skill`](./skills/holocron-skill-skill) | Add a new owned skill to `theholocron/skills` |
| [`holocron-skill-util`](./skills/holocron-skill-util) | Scaffold a new utility package in `theholocron/utils` |
| [`pr-workflow`](./skills/pr-workflow) | Pull request workflow rules |
| [`security-review`](./skills/security-review) | Security review checklist |

## Install

```bash
npm i @theholocron/skills
```

Skills are exposed as importable files:

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const skill = readFileSync(require.resolve("@theholocron/skills/skills/commit-standards/SKILL.md"), "utf-8");
```

## Using skills in Claude Code

Skills registered in Claude Code appear as slash commands. Install them with:

```bash
npx skills add @theholocron/skills
```

Then invoke any skill by name, e.g. `/commit-standards` or `/holocron-skill-client`.
