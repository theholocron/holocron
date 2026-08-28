---
title: Holocron Config Preset System
description: Layered configuration presets for theholocron repositories — what each preset includes, how to compose them, and what stays per-repo.
---

`@theholocron/holocron-config` ships a set of presets that encode the standard configuration for each class of `theholocron/*` repository. Each preset returns a fragment — `providers`, `repo`, `workflows` — that you spread into `defineConfig()` and extend with only the fields unique to your repo.

## Why presets?

Every repo in the org shares a large common baseline: the same source/CI/issues providers, the same branch protection defaults, the same core workflows. Without presets, every `holocron.config.ts` repeats that baseline verbatim. When the baseline changes (new workflow, new provider, new required check), every repo needs a manual sweep.

Presets make the baseline explicit and single-sourced. A repo's config should read as a diff against the standard, not a full restatement of it.

## Preset hierarchy

```
node()          — base: providers, repo defaults, core workflows
  └─ nodeDocs() — adds: org, domain, docs pages, Cloudflare, deploy+preview
nextjs()        — browser app: Vercel, audit, test, Storybook, common checks
react()         — browser app: same minus Vercel + user-flow
monorepo(base)  — extension: wraps any preset with monorepo-specific overrides
```

---

## `node()`

The existing base preset. Every Node.js repo in the org uses this directly or via a derived preset.

**Returns:**

```ts
providers: {
  source: "github",
  ci: "github",
  issues: ["github", { labels: { inProgress: "status:in-progress", inReview: "status:in-review" } }],
}
repo: {
  protection: "strict",
  properties: { lifecycle: "active", open_source: true, runtime_environment: "node", uses_external_packages: true },
}
workflows: [
  "lint", "test", "typecheck", "codeql",
  "review", "stale", "greetings", "dependencies", "bookkeeping",
]
```

**Usage:**

```ts
import { node } from "@theholocron/holocron-config";

const { repo, workflows, providers } = node();
export default defineConfig({
  description: "...",
  repo: { name: "theholocron/my-repo", topics: ["typescript"], ...repo },
  workflows: [...workflows, { name: "release", with: { "run-build": true } }],
  providers,
});
```

---

## `nodeDocs()`

Extends `node()` for repos that publish a documentation site and deploy previews via Cloudflare Pages.

**Adds on top of `node()`:**

| Field                  | Value                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `org`                  | `"theholocron"`                                                                                                                          |
| `domain`               | `"theholocron.dev"`                                                                                                                      |
| `docs`                 | `{ build: "workflow", https: true }`                                                                                                     |
| `providers.deployment` | `"cloudflare"`                                                                                                                           |
| `providers.dns`        | `"cloudflare"`                                                                                                                           |
| `workflows`            | `{ name: "deploy", with: { docs: true, preview: true } }`                                                                                |
| `requiredChecks`       | `"Lint / Conclusion"`, `"Test / Conclusion"`, `"Typecheck / Conclusion"`, `"audit / Conclusion"`, `"codecov/patch"`, `"codecov/project"` |

**Per-repo still provides:** `description`, `homepage`, `repo.name/topics/teams`, `requiredChecks` extensions (`codecov/patch/<package>` per package), extra providers (`vault`, `secrets`, `environments`), extra workflow options (`release`, `audit`, `test` choices).

**Usage:**

```ts
import { nodeDocs } from "@theholocron/holocron-config";

const { repo, workflows, providers, org, domain, docs } = nodeDocs();
export default defineConfig({
  description: "...",
  homepage: "https://docs.theholocron.dev/my-lib/",
  org,
  domain,
  docs,
  repo: {
    ...repo,
    name: "theholocron/my-lib",
    topics: ["typescript", "library"],
    requiredChecks: [...repo.requiredChecks, "codecov/patch/my-package", "codecov/project/my-package"],
  },
  workflows: [...workflows, "audit", { name: "release", with: { "run-build": true } }],
  providers: { ...providers, secrets: "github" },
});
```

**Repos using this preset:** `configs`, `utils`, `themes`, `skills`, `docs`, `clients`, `holocron`

---

## `nextjs()`

For single-package Next.js application repos.

**Includes:**

| Field                                    | Value                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `org`                                    | `"theholocron"`                                                                                                 |
| `domain`                                 | `"theholocron.dev"`                                                                                             |
| `repo.properties.runtime_environment`    | `"browser"`                                                                                                     |
| `repo.properties.uses_external_packages` | `false`                                                                                                         |
| `providers.deployment`                   | `"vercel"`                                                                                                      |
| `providers.secrets`                      | `"github"`                                                                                                      |
| `workflows.audit`                        | `{ run-knip: true, run-performance: true, lighthouse-config: "lighthouse.config.cjs" }`                         |
| `workflows.test`                         | `{ run-unit: false, run-storybook: true, run-interaction: true, run-user-flow: true }`                          |
| `requiredChecks`                         | Conclusion jobs + `codecov/patch`, `codecov/project`, `Storybook Publish`, `UI Review`, `UI Tests`, `lhci/url/` |

**Per-repo still provides:** `run-chromatic` configuration (projects and tokenName vary), `wait-on-url`, cypress check names, storybook deploy config.

**Usage:**

```ts
import { nextjs } from "@theholocron/holocron-config";

const { repo, workflows, providers, org, domain } = nextjs();
export default defineConfig({
  description: "...",
  org,
  domain,
  repo: {
    ...repo,
    name: "theholocron/my-app",
    topics: ["nextjs", "typescript"],
  },
  workflows: [
    ...workflows,
    { name: "test", with: { "run-chromatic": true, "wait-on-url": "http://localhost:3000" } },
    "sync",
    { name: "deploy", with: { docs: true, storybook: [{ name: "" }] } },
  ],
  providers,
});
```

---

## `react()`

For single-package React/Vite application repos. Identical to `nextjs()` except:

- No `deployment: "vercel"` (deploy target left per-repo)
- No `run-user-flow` in the test preset (Cypress not assumed)
- `lighthouse-config` optional

**Usage** follows the same pattern as `nextjs()`.

**Repos using this preset:** `react-template`

---

## `monorepo(base)`

A function that wraps any base preset and applies monorepo-specific overrides. It is an extension, not a standalone preset — it always takes a base.

**Overrides:**

| Field                                    | Change                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `repo.properties.uses_external_packages` | `true` (workspaces pull in many deps)                                       |
| `workflows.test`                         | Adds `run-chromatic` in projects-array format                               |
| `workflows.deploy`                       | Switches storybook from single `{ name: "" }` to `storybook-projects` array |

**Per-repo still provides:** the actual `storybook-projects` array content, chromatic project definitions, workspace-specific required checks.

**Usage:**

```ts
import { monorepo, nextjs } from "@theholocron/holocron-config";

const { repo, workflows, providers, org, domain } = monorepo(nextjs());
export default defineConfig({
  org,
  domain,
  repo: { ...repo, name: "theholocron/my-monorepo" },
  workflows: [
    ...workflows,
    {
      name: "test",
      with: {
        "run-chromatic": {
          projects: [{ tokenName: "default", workingDir: "apps/web" }],
        },
      },
    },
    {
      name: "deploy",
      with: {
        docs: true,
        "storybook-projects": [{ name: "web", workingDir: "apps/web" }],
      },
    },
  ],
  providers,
});
```

**Repos using this extension:** `monorepo-nextjs-template`, `monorepo-react-template`

---

## Required checks strategy

Presets include only stable, cross-repo required checks — the **Conclusion job** from each workflow plus top-level Codecov statuses:

```
"Lint / Conclusion"
"Test / Conclusion"
"Typecheck / Conclusion"
"audit / Conclusion"
"codecov/patch"
"codecov/project"
```

Each repo extends `repo.requiredChecks` with its own package-level Codecov components:

```ts
requiredChecks: [
  ...repo.requiredChecks,           // from preset
  "codecov/patch/my-package-a",
  "codecov/patch/my-package-b",
  "codecov/project/my-package-a",
  "codecov/project/my-package-b",
],
```

The Conclusion job pattern (see [ADR 001](./decisions/001-holocron-config-preset-system.md)) means that when a workflow gains or renames a job, no `requiredChecks` array needs updating — only the workflow file itself changes.

---

## What never goes in a preset

- **`description`** and **`homepage`** — unique to each repo
- **`repo.name`** — must be explicit
- **`repo.topics`** — unique to each repo's subject matter
- **Package-level `codecov` checks** — unique to each repo's package structure
- **`run-chromatic` project configuration** — varies by app structure
- **Test-specific `with` options** (`wait-on-url`, specific build scripts) — varies by app
- **Template repo configs** — templates have divergent testing setups and are excluded
