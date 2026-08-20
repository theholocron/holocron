---
title: Capabilities
description: Reference for all 14 capability interfaces that Holocron plugins implement.
---

Capabilities are the contracts between the Holocron CLI and its plugins. Each capability is a TypeScript interface that plugins implement; the CLI calls methods on the interface without knowing which provider is behind it.

## Single-provider capabilities

These accept exactly one plugin per repo.

### `source`

Repository, branch, workflow file, and security operations. Implemented by: [GitHub](./plugins/github).

| Method                                  | Description                                                    |
| --------------------------------------- | -------------------------------------------------------------- |
| `whoami()`                              | Verify authentication                                          |
| `getRepo()`                             | Return the repo's `{ owner, name, defaultBranch }`             |
| `listRulesets()`                        | List all branch rulesets                                       |
| `createRuleset(payload)`                | Create a new ruleset                                           |
| `updateRuleset(id, payload)`            | Update an existing ruleset                                     |
| `updateRepoSettings(settings)`          | Toggle repo feature flags (squash merge, auto-delete, etc.)    |
| `protectBranch(branch, payload)`        | Apply classic branch protection (fallback for free-plan repos) |
| `enableVulnerabilityAlerts()`           | Enable Dependabot alerts                                       |
| `enableAutomatedSecurityFixes()`        | Enable Dependabot auto-PRs                                     |
| `enableSecretScanning()`                | Enable secret scanning                                         |
| `enablePrivateVulnerabilityReporting()` | Enable private security advisories                             |
| `enableDependencyGraph()`               | Enable dependency graph + snapshot submission                  |
| `enableCodeScanning()`                  | Enable CodeQL default setup (extended query suite)             |
| `disableDefaultCodeScanning()`          | Disable CodeQL default setup (required for advanced workflows) |
| `listWorkflowFiles()`                   | List `.github/workflows/` file names                           |
| `readWorkflowFile(name)`                | Read a workflow file's contents                                |
| `writeWorkflowFile(name, contents)`     | Write a workflow file                                          |
| `removeWorkflowFile(name)`              | Delete a workflow file                                         |
| `writeRepoFile(path, contents)`         | Write any file relative to the repo root                       |
| `syncLabels?(canonical, stale)`         | Upsert canonical labels, delete stale ones                     |
| `syncProperties?(values)`               | Set org custom property values                                 |
| `syncTopics?(topics)`                   | Replace repo topic set                                         |
| `syncTeams?(teams)`                     | Sync team repository access                                    |
| `syncDescription?(description)`         | Set repo description                                           |
| `syncHomepage?(homepage)`               | Set repo homepage URL                                          |

### `ci`

Read CI workflow run history and status. Implemented by: [GitHub](./plugins/github).

| Method              | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `listRuns(filter?)` | List recent CI runs (filter by branch, status, limit) |
| `getRun(id)`        | Get a single run by id                                |

### `secrets`

Set and delete CI/platform secrets at repo, environment, or org scope. Implemented by: [GitHub](./plugins/github).

| Method                          | Description                          |
| ------------------------------- | ------------------------------------ |
| `listSecrets(scope)`            | List secret names at the given scope |
| `setSecret(scope, name, value)` | Upsert a secret (handles encryption) |
| `deleteSecret(scope, name)`     | Remove a secret                      |

Scope forms:

- `{ kind: "repo" }` — repository secret
- `{ kind: "environment", name: "production" }` — environment secret
- `{ kind: "organization", name: "my-org" }` — org secret

### `environments`

Manage named deployment environments (protection rules, reviewers, wait timers). Implemented by: [GitHub](./plugins/github).

| Method                    | Description                     |
| ------------------------- | ------------------------------- |
| `listEnvironments()`      | List all environments           |
| `upsertEnvironment(env)`  | Create or update an environment |
| `deleteEnvironment(name)` | Remove an environment           |

### `issues`

Issue creation, search, lifecycle transitions, and comments. Implemented by: [GitHub](./plugins/github).

| Method                  | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| `getMyself()`           | Return the authenticated user                             |
| `search(filter)`        | Search issues (by assignee, open status, limit)           |
| `get(key)`              | Fetch a single issue by key                               |
| `create(input)`         | Create an issue                                           |
| `transition(key, slot)` | Move an issue to `inProgress`, `inReview`, or `done`      |
| `comment(key, body)`    | Add a comment                                             |
| `doctor()`              | Validate tracker configuration and lifecycle slot mapping |

### `deployment`

Trigger and query deployments; manage projects and env vars. Implemented by: [Vercel](./plugins/vercel).

| Method                                      | Description                                         |
| ------------------------------------------- | --------------------------------------------------- |
| `listProjects()`                            | List all projects                                   |
| `ensureProject(input)`                      | Create a project if missing (idempotent)            |
| `updateProjectSettings(id, settings)`       | Update project settings                             |
| `listEnvVars(projectId, target)`            | List env var names for a target                     |
| `setEnvVar(projectId, target, name, value)` | Upsert an env var                                   |
| `triggerDeployment(input)`                  | Deploy a branch (to preview or a named environment) |
| `getDeployment(id)`                         | Poll a deployment's status                          |

### `storage`

Database branch management and connection strings. Implemented by: [Neon](./plugins/neon).

| Method                                 | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `getConnectionString(scope, options?)` | Get the connection URL for a branch/scope          |
| `listBranches?()`                      | List all database branches                         |
| `createBranch?(input)`                 | Create a new branch                                |
| `destroyBranch?(branch)`               | Delete a branch                                    |
| `resetBranch?(input)`                  | Reset a branch to match another                    |
| `enableExtension?(input)`              | Run `CREATE EXTENSION IF NOT EXISTS …` on a branch |

### `auth`

Identity provider integration (user management, webhooks). Implemented by: [Clerk](./plugins/clerk).

| Method                      | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `describe()`                | Return the provider name and required env var keys       |
| `whoami()`                  | Reachability probe — verifies the configured key works   |
| `ensureWebhookApp?()`       | Idempotent webhook backend provisioning                  |
| `getWebhookDashboardUrl?()` | Deep-link to the webhook config dashboard                |
| `createUser?(input)`        | Seed a user (test fixtures, admin bootstrap)             |
| `syncWebhook?(input)`       | Wire the auth provider's webhook into the project's repo |

### `vault`

Secret source-of-truth — read, write, list, and manage environments. Implemented by: [1Password](./plugins/1password), [Doppler](./plugins/doppler), [Infisical](./plugins/infisical).

| Method                              | Description                                       |
| ----------------------------------- | ------------------------------------------------- |
| `read(reference)`                   | Read a secret by provider-specific reference      |
| `write(reference, value)`           | Write or update a secret                          |
| `list()`                            | List available secret keys                        |
| `environments?()`                   | List named environments (e.g. Doppler configs)    |
| `readEnvironment?(id)`              | Bulk-read all KEY=VALUE pairs from an environment |
| `ensureProject?(name)`              | Create the project container if it doesn't exist  |
| `ensureEnvironment?(project, name)` | Create a named environment inside a project       |

### `dns`

DNS record management. Implemented by: [Cloudflare](./plugins/cloudflare).

| Method                         | Description                       |
| ------------------------------ | --------------------------------- |
| `listRecords(domain)`          | List all DNS records for a domain |
| `upsertRecord(domain, record)` | Create or update a record         |
| `deleteRecord(domain, id)`     | Delete a record by id             |

## Multi-provider capabilities

These accept any number of providers — all are active simultaneously.

### `tooling`

Sync external tool state from the repo. Implemented by: [Postman](./plugins/postman).

| Method     | Description                                            |
| ---------- | ------------------------------------------------------ |
| `sync()`   | Pull the tool's authoritative state from the repo      |
| `doctor()` | Return `{ ok, message }` — a health check for the tool |

### `notifications`

Send messages. Implemented by: [Discord](./plugins/discord), [Slack](./plugins/slack).

| Method                   | Description                 |
| ------------------------ | --------------------------- |
| `send(channel, message)` | Send a message to a channel |

### `analytics`

Project provisioning and tracking token retrieval for product analytics. Implemented by: [PostHog](./plugins/posthog).

| Method                | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `describe()`          | Return the provider name and required env var keys     |
| `whoami()`            | Verify the personal API key                            |
| `ensureProject(name)` | Find or create a project, returning its tracking token |

### `observability`

Error tracking — project provisioning and DSN retrieval. Implemented by: [Sentry](./plugins/sentry).

| Method                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `describe()`           | Return the provider name and required env var keys |
| `whoami()`             | Verify the token by fetching the organization      |
| `ensureProject(input)` | Create or retrieve a project, returning its DSN    |
