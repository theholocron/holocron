---
title: GitHub Plugin
description: Implements source, ci, secrets, environments, and issues against the GitHub REST API.
---

`@theholocron/holocron-plugin-github` is the most full-featured first-party plugin. It implements five capabilities against the GitHub REST API using `@theholocron/github-client`.

## Install

```bash
pnpm add -D @theholocron/holocron-plugin-github
```

## Capabilities

| Capability     | Token required                            |
| -------------- | ----------------------------------------- |
| `source`       | `HOLOCRON_ADMIN_TOKEN` (`github.admin`)   |
| `ci`           | `HOLOCRON_READ_TOKEN` (`github.read`)     |
| `secrets`      | `HOLOCRON_ADMIN_TOKEN` (`github.admin`)   |
| `environments` | `HOLOCRON_ADMIN_TOKEN` (`github.admin`)   |
| `issues`       | `HOLOCRON_ISSUES_TOKEN` (`github.issues`) |

## Config

```ts
providers: {
  source: "github",
  ci: "github",
  secrets: "github",
  environments: "github",
  issues: ["github", {
    // Optional: map lifecycle slots to issue label names
    labels: {
      inProgress: "status: in-progress",
      inReview: "status: in-review",
    },
  }],
}
```

### Options

| Option              | Type     | Description                                                                          |
| ------------------- | -------- | ------------------------------------------------------------------------------------ |
| `repo`              | `string` | `"owner/name"` — derived from `repo.name` in config or git remote when absent        |
| `repoRoot`          | `string` | Absolute path to repo root for workflow file operations. Defaults to `process.cwd()` |
| `labels.inProgress` | `string` | Label name to set when transitioning an issue to `inProgress`                        |
| `labels.inReview`   | `string` | Label name to set when transitioning an issue to `inReview`                          |

## Authentication

Requires up to five separate fine-grained PATs depending on which capabilities you configure:

```bash
holocron auth set github.admin   ghp_xxx  # source, secrets, environments
holocron auth set github.read    ghp_yyy  # ci, clone
holocron auth set github.issues  ghp_zzz  # issues
holocron auth set github.sync    ghp_aaa  # sync-github
holocron auth set github.release ghp_bbb  # semantic-release
```

See the [Token Reference](../tokens#github-tokens) for the exact PAT scopes each needs.

## What `source` provides

- Repo settings (squash merge, delete-branch-on-merge, auto-merge)
- Branch rulesets and classic branch protection
- Security toggles (vulnerability alerts, secret scanning, CodeQL, etc.)
- Workflow file read/write (`.github/workflows/`)
- Arbitrary repo file write (`.github/dependabot.yml`, etc.)
- Labels, custom properties, topics, teams, description, homepage sync

## What `issues` provides

- Search by assignee or open-only filter
- Create issues with summary, body, labels, milestone
- Transition issues via label: `inProgress` → sets `labels.inProgress`, `done` → closes
- Add comments
- `doctor()` — lists available labels and validates lifecycle slot mapping

## Webhook events

The plugin exports a `parseWebhook` function for normalizing GitHub webhook payloads into `AuthEvent` shapes (for repos using GitHub as a lightweight auth event source):

```ts
import { parseWebhook } from "@theholocron/holocron-plugin-github";

const event = await parseWebhook({
	body: req.body,
	headers: req.headers,
	signingSecret: process.env.GITHUB_WEBHOOK_SECRET!,
});
// event.type: "user.created" | "user.updated" | "user.deleted"
// event.user: NormalizedAuthUser
```
