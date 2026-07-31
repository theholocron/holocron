---
title: "sync"
description: Sync repository metadata from holocron.config.ts to GitHub and local files.
---

```bash
holocron sync [steps..] [--repo owner/name] [--dry-run]
```

`sync` pushes metadata defined in `holocron.config.ts` to the configured `source` provider (GitHub) and to local files. Run it after updating any of the synced fields in config.

## Steps

Pass specific step names to run only those steps. Omit to run all.

```bash
holocron sync                               # run all steps
holocron sync labels properties             # run only labels and properties
```

| Step | What it syncs | Requires provider token |
| --- | --- | --- |
| `labels` | GitHub labels — upserts canonical set, deletes stale ones | Yes (`HOLOCRON_ADMIN_TOKEN`) |
| `properties` | Org-level custom properties (`repo.properties`) | Yes |
| `teams` | Team repository access (`repo.teams`) | Yes |
| `topics` | GitHub topics (`repo.topics`) | Yes |
| `keywords` | `package.json#keywords` — set from `repo.topics` | No |
| `description` | `package.json#description` and GitHub repo description | No (local) / Yes (GitHub) |
| `homepage` | `package.json#homepage` and GitHub repo website field | No (local) / Yes (GitHub) |

Local steps (`keywords`, `description`, `homepage`) write to the local filesystem. If a `source` plugin is also configured, they additionally push to GitHub. Running without a token skips the GitHub push but still updates local files.

## Options

| Option | Description |
| --- | --- |
| `[steps..]` | Subset of steps to run (default: all) |
| `--repo owner/name` | Override repo coordinate |
| `--dry-run` | Print changes without writing |

## Examples

```bash
# Sync everything
holocron sync

# Only sync labels and topics to GitHub
holocron sync labels topics

# Update local package.json fields without touching GitHub
holocron sync description homepage keywords

# Dry-run all
holocron sync --dry-run
```
