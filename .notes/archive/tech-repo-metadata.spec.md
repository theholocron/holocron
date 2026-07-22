---
status: archived
completed: 2026-07-15
prs:
    - theholocron/holocron#145 # Steps 1–6
    - theholocron/holocron#146 # Step 7 — drop repoPolicy
    - theholocron/holocron#147 # HolocronConfig type in self-hosted config
    - theholocron/configs#235
    - theholocron/clients#123
    - theholocron/.github#41
    - theholocron/.github-private#16
---

<!-- editorconfig-checker-disable-file -->
<!-- markdownlint-disable MD013 -->

# Spec: Unified repo metadata config

## Problem

Repo metadata in `holocron.config.ts` is fragmented and incomplete:

- Branch protection is under `project.repoPolicy.preset` — a nested object that
  mixes the preset name with `requiredChecks`, making it awkward to read at a glance.
- GitHub custom properties (org dashboard filtering, ruleset targeting) have no
  config key at all — they were set once manually and have no ongoing sync.
- GitHub topics (public discoverability) have no config key — set manually per repo
  with no record in version control.
- The repo name (`project.repo`) is a bare string sitting alongside tooling config
  rather than being the root of a cohesive repo identity object.

## Shipped config shape

```typescript
import { defineConfig } from "@theholocron/cli";
import type { HolocronConfig } from "@theholocron/cli";

export default defineConfig({
  project: {
    name: "clients",
    description: "HTTP clients and API wrappers.",
    repo: {
      name: "theholocron/clients",
      protection: "strict",
      requiredChecks: [
        "Lint / Lint entire codebase",
        "Test / Run tests and collect coverage",
        "Typecheck / tsc --noEmit",
      ],
      topics: ["api-client", "nodejs", "typescript"],
      properties: {
        lifecycle: "active",
        open_source: true,
        runtime_environment: "node",
        uses_external_packages: true,
      },
    },
    workflows: ["lint", "test", "typecheck", "codeql", "review", "release"],
  },
  providers: { ... },
} satisfies HolocronConfig);
```

> **Note:** The draft spec proposed `project.repo` as `string | RepoConfig`. The
> string form was dropped during implementation — `project.repo` is always a
> `RepoConfig` object. `project.repoPolicy` was removed entirely (no migration shim
> was kept beyond the rollout window).

## Config schema (as shipped)

```typescript
type RepoProtection = "balanced" | "strict" | "none";

interface RepoProperties {
	lifecycle?: "active" | "experimental" | "deprecated";
	open_source?: boolean;
	runtime_environment?: "node" | "browser" | "universal" | "none";
	uses_external_packages?: boolean;
}

interface RepoConfig {
	name: string;
	protection?: RepoProtection; // omit = no protection applied, no property set
	requiredChecks?: string[]; // only meaningful when protection = "strict"
	topics?: string[];
	properties?: RepoProperties;
}
```

## Custom properties

All properties are defined at the org level and set per-repo via
`PATCH /repos/{owner}/{repo}/properties/values`.

| Property                  | Type            | Values                                    | Source                                   |
| ------------------------- | --------------- | ----------------------------------------- | ---------------------------------------- |
| `branch_protection_level` | `single_select` | `balanced` / `strict` / `none`            | derived from `repo.protection`           |
| `lifecycle`               | `single_select` | `active` / `experimental` / `deprecated`  | `repo.properties.lifecycle`              |
| `monorepo`                | `true_false`    | —                                         | derived: `pnpm-workspace.yaml` present   |
| `open_source`             | `true_false`    | —                                         | `repo.properties.open_source`            |
| `runtime_environment`     | `single_select` | `node` / `browser` / `universal` / `none` | `repo.properties.runtime_environment`    |
| `uses_external_packages`  | `true_false`    | —                                         | `repo.properties.uses_external_packages` |

> **`branch_protection_level`** is only written when `protection` is explicitly
> set and not `"none"`. Omitting `protection` leaves the property unset (no silent
> "balanced" default).

## Topics

`repo.topics` is the authoritative list for the repo. `syncTopics` calls
`PUT /repos/{owner}/{repo}/topics` with the full array — GitHub replaces the
topic set atomically, so the config is always the source of truth.

Topics are not auto-derived; they must be set explicitly. Conventions:

- Use lowercase, hyphen-separated slugs (`api-client`, not `apiClient`)
- Include runtime (`nodejs`, `browser`) when `runtime_environment` is set
- Include domain descriptors (`cli`, `config`, `api-client`, `developer-tools`)

## Implementation steps (completed)

All seven steps completed across PRs #145, #146.

Key implementation decisions made during development:

- **String form dropped** — `project.repo` is `RepoConfig` only, not
  `string | RepoConfig`. A short-lived runtime guard in `loader.ts` bridged
  JSON configs during the rollout window and was removed in Step 7.
- **`effectivePreset` unified** — both the actual branch-protection application
  and the `branch_protection_level` property write derive from the same
  `repo?.protection` value, so the metadata can never diverge from applied
  protection.
- **`monorepo` detection scoped to `repoRoot`** — uses
  `join(input.context.repoRoot, "pnpm-workspace.yaml")` not `process.cwd()`.
- **`syncTopics` / `syncProperties` in `Source` interface** — optional methods
  following the same pattern as `syncLabels?`.

## Resolved open questions

- **String form kept permanently?** No — dropped entirely once all repos migrated.
- **`uses_external_packages` auto-derived?** No — remains manual config for now.
- **Org schema automation?** Remains a one-time scripted step; no `setup-org` command.
- **Ruleset targeting via properties?** Deferred pending GitHub Team+ upgrade (issue #142).
