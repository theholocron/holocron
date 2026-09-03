---
status: proposed
issue: theholocron/holocron#493
blocked-by: []
related:
  - theholocron/holocron#449
  - theholocron/holocron#451
---

# `holocron project` — project board management

Adds a `holocron project` command group for creating, listing, and closing
GitHub Projects v2 boards from the CLI, with a template system so boards can
be provisioned consistently across the org.

---

## Motivation

GitHub Projects v2 boards for the org are managed entirely through the UI.
Today there is no way to:

- Spin up a new project with the org's standard field set and view layout
  without clicking through a dozen dialogs
- Close or audit projects from the terminal
- Recreate a board from a known-good definition (boards are effectively
  undocumented config that lives only in GitHub's database)

This matters because project boards are org infrastructure. They should be
reproducible, version-controlled, and manageable from the same tool that
manages everything else.

---

## Goals

- `holocron project list` — list org projects with number, title, and open/closed state
- `holocron project create [template]` — create a project from a named template; output the URL
- `holocron project close <number>` — close (archive) a project by number
- The project management backend is modelled as a provider under `providers.projects`
  in `holocron.config.ts`, following the same convention as `providers.wiki`
- Templates ship as named presets in `@theholocron/cli` and can be extended or
  overridden via provider options in `holocron.config.ts`
- `create` is idempotent on title — if a project with the same title already
  exists, prompt the user rather than creating a duplicate

## Non-goals

- Managing project views beyond what is defined in the template (field
  reordering, filter expressions, saved sorts)
- Cross-org project support — all commands operate on `config.org`
- Archiving closed items off the board — handled by the project's built-in
  workflow automation ("Item closed" / "Pull request merged"), enabled in the
  project settings UI after creation
- Deleting projects — close only; deletion is irreversible and GitHub does not
  expose a bulk-undo

---

## Command surface

```
holocron project list
holocron project create [template] [--title <title>] [--org <org>]
holocron project close <number> [--yes]
```

### `list`

```
$ holocron project list
  #   Title                      State
  ─── ─────────────────────────  ──────
  4   Holocron CLI Roadmap        open
  3   v3 Release Tracker          closed
  2   Bug Backlog                 closed
```

Reads `config.org` for the owner. Accepts `--org` to override.

### `create [template]`

```
$ holocron project create roadmap --title "v5.0 Roadmap"
✔ Created project: https://github.com/orgs/theholocron/projects/7
  Title:    v5.0 Roadmap
  Template: roadmap
  Fields:   Status, Priority, Milestone
  Views:    By status (kanban), All items (table)
```

If `template` is omitted, presents an interactive `select()` picker over
the available templates (built-in + config-defined).

If a project with the same title already exists:

```
! A project named "v5.0 Roadmap" already exists (#5).
  Open it? [Y/n]
```

### `close <number>`

```
$ holocron project close 7
  Close project #7 "v5.0 Roadmap"? [y/N] y
✔ Closed.
```

`--yes` skips the confirmation prompt. Closing is reversible; the project
can be reopened from the GitHub UI.

---

## Provider config

The project management backend is declared under `providers.projects` in
`holocron.config.ts`, following the same pattern as `providers.wiki`.

```ts
// holocron.config.ts
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
  providers: {
    // Short form — GitHub Projects v2, no template customization
    projects: "github",

    // Tuple form — provider + options (template overrides, org override)
    projects: [
      "github",
      {
        org: "theholocron", // defaults to config.org
        templates: {
          // Extend the built-in roadmap with a custom field
          roadmap: {
            extends: "roadmap",
            fields: [{ name: "Team", type: "single_select", options: ["CLI", "Infra", "Docs"] }],
          },
          // Fully custom template
          "bug-bash": {
            fields: [
              { name: "Status", type: "single_select", options: ["Triage", "Confirmed", "Fixed", "Wontfix"] },
              { name: "Severity", type: "single_select", options: ["P0", "P1", "P2"] },
            ],
            views: [{ name: "By severity", layout: "table", groupBy: "Severity" }],
          },
        },
      },
    ],
  },
});
```

`providers.projects` is optional. When absent, `holocron project` resolves
the provider from the `config.org` owner type — if the org is a GitHub org,
`"github"` is assumed. An explicit provider entry is only required to supply
options.

Future providers (`"linear"`, `"jira"`) would be plugged in here without
any change to the `holocron project` command surface.

---

## Template system

Templates define the structure of a project board. Two sources are merged at
runtime — built-in presets and config-driven overrides from the provider options.

### Built-in templates

#### `roadmap` (default)

Mirrors the current org roadmap board (project #4):

| Component  | Definition                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| **Fields** | Status (Someday / Todo / In Progress / Done), Priority (1·Now / 2·Next / 3·Process), Milestone (text) |
| **Views**  | Kanban grouped by Status (default), Table with all fields                                             |

#### `sprint`

Lightweight iteration board:

| Component  | Definition                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| **Fields** | Status (Todo / In Progress / Done / Blocked), Sprint (text, e.g. "2026-W36") |
| **Views**  | Kanban grouped by Status (default)                                           |

### Template schema

**Field type map** (subset of the GitHub Projects v2 field types):

| `type` value    | GitHub field type |
| --------------- | ----------------- |
| `single_select` | `SINGLE_SELECT`   |
| `text`          | `TEXT`            |
| `number`        | `NUMBER`          |
| `date`          | `DATE`            |
| `iteration`     | `ITERATION`       |

**View layout values:** `"board"` (kanban) or `"table"`.

A config-defined template may set `extends: "<built-in-name>"` to inherit all
fields and views from a built-in and add to them. Without `extends`, the
template is treated as fully custom and must define all fields and views.

---

## Implementation

### File layout

```
packages/cli/src/commands/project/
  index.ts          ← yargs parent command + subcommand registration
  list.ts
  create.ts
  close.ts
  templates/
    index.ts        ← exports getTemplate(name, config): ResolvedTemplate
    roadmap.ts      ← built-in roadmap definition
    sprint.ts       ← built-in sprint definition
  graphql/
    queries.ts      ← listProjects
    mutations.ts    ← createProject, createField, createView, closeProject
packages/cli/src/providers/projects/
  index.ts          ← ProjectsProvider interface
  github.ts         ← GitHub Projects v2 implementation
```

The `ProjectsProvider` interface decouples the command layer from the GitHub
GraphQL implementation. `list`, `create`, and `close` call provider methods;
the GitHub implementation does the GraphQL work.

```ts
export interface ProjectsProvider {
  list(org: string): Promise<ProjectSummary[]>;
  create(org: string, title: string, template: ResolvedTemplate): Promise<CreatedProject>;
  close(org: string, number: number): Promise<void>;
}
```

### GraphQL operations (GitHub provider)

**`list` — query**

```graphql
query ListProjects($org: String!, $first: Int!, $after: String) {
  organization(login: $org) {
    projectsV2(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        title
        closed
        url
      }
    }
  }
}
```

**`create` — mutation sequence**

1. `createProjectV2` → project node ID
2. For each field in the template: `createProjectV2Field` (single-select options included inline)
3. For each view in the template: `createProjectV2View` + `updateProjectV2View` (layout, groupBy)

```graphql
mutation CreateProject($ownerId: ID!, $title: String!) {
  createProjectV2(input: { ownerId: $ownerId, title: $title }) {
    projectV2 {
      id
      number
      url
    }
  }
}

mutation CreateField(
  $projectId: ID!
  $name: String!
  $dataType: ProjectV2CustomFieldType!
  $singleSelectOptions: [ProjectV2SingleSelectFieldOptionInput!]
) {
  createProjectV2Field(
    input: { projectId: $projectId, name: $name, dataType: $dataType, singleSelectOptions: $singleSelectOptions }
  ) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
      }
    }
  }
}
```

### Token resolution

All project mutations require a token with `project` scope. `GITHUB_TOKEN`
from Actions does not carry this scope for org-level projects.

Resolution order (existing precedence chain, extended):

1. `--token` flag
2. `HOLOCRON_ORG_TOKEN` env var
3. Keyring entry for `github.org` provider
4. `GH_TOKEN` env var
5. Error: prompt the user to run `holocron auth set github`

`project list` only needs read access and can fall back to `github.token` in
Actions (`GITHUB_TOKEN`).

### Idempotency on `create`

Before creating, `create` fetches the first 100 open projects and checks for
a title collision. On match, it prompts interactively. In CI (`--yes`), it
skips creation and prints the existing project URL.

### Pagination

`list` paginates automatically using `pageInfo.hasNextPage` + `endCursor`
cursor forwarding. No manual `--page` flag needed.

---

## Open questions

1. **View configuration depth** — `updateProjectV2View` supports layout,
   groupBy, sortBy, and visible fields. Should the template schema expose all
   of these, or just `layout` and `groupBy` for the first iteration?

2. **Title uniqueness scope** — collision check is org-wide. If the same org
   runs multiple teams with projects named "Sprint 1", this will false-positive.
   Could scope to open projects only, or skip the check entirely and let GitHub
   create duplicates.
