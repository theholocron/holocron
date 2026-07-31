---
title: "new"
description: Scaffold a new repository from a GitHub template.
---

```bash
holocron new [type] [name] [--description <text>] [--org <org>] [--no-verify]
```

Creates a new GitHub repository from a `theholocron/<type>-template` template and runs `pnpm install` in the cloned result. If `type` or `name` are omitted, the CLI prompts interactively.

## Arguments and options

| Argument / Option | Default | Description |
| --- | --- | --- |
| `[type]` | *(prompted)* | Template type — maps to `theholocron/<type>-template` |
| `[name]` | *(prompted)* | New repo name in kebab-case |
| `--description` | *(prompted, skippable)* | Short description replacing `<description>` placeholders |
| `--org` | `theholocron` | GitHub org that owns the template and will own the new repo |
| `--no-verify` | `false` | Skip `pnpm install` after scaffolding |

## Available template types

| Type | Template repo |
| --- | --- |
| `base` | `theholocron/base-template` |
| `cli` | `theholocron/cli-template` |
| `monorepo` | `theholocron/monorepo-template` |
| `nextjs` | `theholocron/nextjs-template` |
| `node` | `theholocron/node-template` |
| `react` | `theholocron/react-template` |

## Examples

```bash
# Interactive — prompts for type, name, description
holocron new

# Non-interactive
holocron new cli my-new-tool --description "A CLI tool that does things"

# Skip pnpm install (useful in CI or when you'll install manually)
holocron new node my-lib --no-verify
```

## Authentication

Uses `HOLOCRON_READ_TOKEN` / `github.read` keyring entry to create the repo from the template. The PAT needs `repo: read/write` (classic) or `contents: read/write`, `metadata: read` (fine-grained).
