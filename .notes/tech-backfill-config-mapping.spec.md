---
id: SPEC-0104
status: draft
issue: theholocron/holocron#2495
blocked-by: []
related:
  - theholocron/holocron#2430
  - theholocron/holocron#2494
discussion:
  url: https://discord.com/channels/1303969001822486568/1573225371640402020
---

# Backfill mapping and repositories as configuration

## Problem

`holocron probe github issue-types` (spec `tech-github-area-labels`, rollout item 5) has two things written into its code: the table that says which kind label means which issue Type, and the one repository it works on (the plugin's own). Another repository of the organization, or a different label vocabulary, means editing the plugin. Decided in that spec (Final answers, 8): both become configuration.

## Design

### The kind table

`repo.labels.kinds` is a map from a label name to an issue Type name. It is validated when the config loads, like `areas` and `scopes` (`validateRepoLabels()`): a label name is a non-empty string of at most 50 characters, a Type name a non-empty string, and one label cannot be in two tables (names ignore case).

Today's rule has two tiers, which #2494 made explicit, so there are two tables:

| Key             | Meaning                                                | Default                                                                                |
| --------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `kinds`         | The main labels. They always win over the other table. | `bug` to Bug, `enhancement` to Feature, `chore` to Task                                |
| `fallbackKinds` | Used only when the issue has none of the main labels.  | `ci`, `documentation`, `refactor`, `test`, `performance`, `dependencies`, each to Task |

A key that is left out keeps its default, so a repository that sets nothing behaves exactly as the probe does today, including the Task labels of #2494. Setting a key replaces that whole table; `{}` turns it off.

The rules do not change: a Type already set is never changed; labels that point to two different Types (in the main table, or, with none of those, in the fallback table) leave the issue listed for a person; labels that point to one Type, however many, set it.

The Type names are checked at run time against the organization's issue Types (one read), because only the organization knows them. A Type the tables name that the organization lacks is a failing row naming the Type and the labels that use it, and that repository's run stops before any write.

### The repositories

- `--repo owner/name`, repeatable, names the repositories of a run.
- `repo.labels.repos` (a list of `owner/name`) is the default list when no `--repo` is given.
- With neither, the repository is the plugin's own (holocron stays the default).

`--issues` and `--after` are numbers of one repository, so they are refused together with more than one repository. `--milestone` and `--project` are names and apply to each. A run prints a heading row per repository, and the resume command names `--repo`. A failure in one repository is a row and the next one still runs. Nothing is overwritten and no label is removed, whatever the repository.

### Area labels of another repository

Each repository's own `repo.labels` decides its area labels. The probe reads them from that repository: `.holocron/repo.json` through the contents API (the area file of a repository with no `package.json`, `{ "labels": { "areas": ..., "scopes": ... } }`). A repository whose areas are in `.holocron/repo.ts` cannot be read this way: that file is TypeScript, and evaluating it is what Sentinel's remote config reader does (`validateConfig()` in `apps/sentinel`, which writes the whole directory to a sandbox and loads it). That reader belongs to the app and is not importable from a plugin, and a second one is out of scope here, so such a repository gets a skipped row that says so and the Type step still runs. A repository with neither file, or with no `labels.areas`, gets no area step and a row saying so. The plugin's own repository uses the config it was handed, as today.

## Not decided here

Reading `.holocron/repo.ts` of another repository (it needs Sentinel's reader in a shared package). Reading `kinds` from another repository (the table is the running config's).

## Not verified

Everything here is checked against fakes; the real run is the maintainer's. The read of the organization's issue Types and the read of another repository's file are not run against the live API.
