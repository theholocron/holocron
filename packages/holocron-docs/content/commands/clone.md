---
title: "clone"
description: Clone all repos in a GitHub org as siblings under a single directory.
---

```bash
holocron clone --org <org> [--dir <path>] [--dry-run] [--token github=<token>]
```

Clones every repository in a GitHub org into a common parent directory. Repos that already exist locally are skipped.

## Options

| Option | Required | Description |
| --- | --- | --- |
| `--org` | Yes | GitHub org to clone (e.g. `theholocron`) |
| `--dir` | No | Parent directory to clone into. Defaults to `~/Code/<org>` |
| `--dry-run` | No | Print what would be cloned without running `git clone` |
| `--token github=<token>` | No | Override the GitHub read token for this invocation |

## Authentication

Uses `HOLOCRON_READ_TOKEN` / `github.read` keyring entry. Required scopes: `contents: read`, `metadata: read`.

## Examples

```bash
# Clone all theholocron repos into ~/Code/theholocron/
holocron clone --org theholocron

# Clone into a custom directory
holocron clone --org theholocron --dir ~/repos/theholocron

# Preview without cloning
holocron clone --org theholocron --dry-run
```
