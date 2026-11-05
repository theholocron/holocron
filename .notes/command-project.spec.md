---
id: SPEC-0020
status: proposed
issue: theholocron/holocron#493
blocked-by: []
related:
  - theholocron/holocron#449
  - theholocron/holocron#451
  - theholocron/holocron#1744
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618558295965696
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

Creating a board is only half of it. Changing one is risky: a single select
field's options can only be replaced as a whole list, and a list sent without
each existing option's `id` gives every option a new id and **blanks the field
on every item**. Adding a `Blocked` status to the org board did exactly that
twice (v4, then v5) and each time the values had to be restored from a snapshot
taken by hand. A board that is declared in the repo can be checked for drift
and changed without that risk (#1744).

---

## Goals

- `holocron project setup` — make a board match its declaration in `holocron.config.ts`, creating it
  when it does not exist, and `holocron doctor project` — compare the two, one row per
  field, option and view (see [Declared board](#declared-board-apply-and-check))
- A field change never clears a value: existing options are sent with their `id`
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
            views: [
              { name: "Active", layout: "table", filter: "-status:Triage -status:Fixed -status:Wontfix" },
              { name: "By severity", layout: "table", groupBy: "Severity" },
            ],
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

Mirrors the current org roadmap board (project 5, "v5"; v4 was closed on 2026-11-05):

| Component  | Definition                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **Fields** | Status (Someday / Todo / In Progress / Blocked / Done), Priority (1 · Now / 2 · Next / 3 · Process), Milestone (text) |
| **Views**  | Active (default), Backlog, Done — see below                                                                           |

`Blocked` is a status for an item that waits on another issue or an outside change.
The dependency itself is GitHub's "blocked by" link; the column only makes it visible.

**Views (as they are on the live board):**

| Name    | Layout | Filter                         | Purpose                                              |
| ------- | ------ | ------------------------------ | ---------------------------------------------------- |
| Active  | board  | `-status:Someday -status:Done` | Day-to-day working view (Todo, In Progress, Blocked) |
| Backlog | board  | `status:Someday`               | Everything parked for later                          |
| Done    | table  | `status:Done`                  | Completed work, historical record                    |

The Active view is set as the default so the board opens showing only
committed work. Done items are never seen unless you switch to the Done view —
no need to archive individual items to keep the board clean.

#### `sprint`

Lightweight iteration board:

| Component  | Definition                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| **Fields** | Status (Todo / In Progress / Done / Blocked), Sprint (text, e.g. "2026-W36") |
| **Views**  | Active (table, `-status:Done`, default), Done (table, `status:Done`)         |

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

**View properties:**

| Property  | Type    | Description                                                                                       |
| --------- | ------- | ------------------------------------------------------------------------------------------------- |
| `name`    | string  | Display name shown in the tab                                                                     |
| `layout`  | string  | `"board"` or `"table"`                                                                            |
| `filter`  | string  | GitHub Projects filter expression (e.g. `"status:Done"`, `"-status:Someday"`)                     |
| `groupBy` | string  | Field name to group rows/columns by                                                               |
| `default` | boolean | If `true`, this view opens when the project is first loaded. First view wins if multiple are set. |

A config-defined template may set `extends: "<built-in-name>"` to inherit all
fields and views from a built-in and add to them. Without `extends`, the
template is treated as fully custom and must define all fields and views.

---

## Declared board: apply and check

A board is declared the way the notifications server is: the provider's `layout` in
`holocron.config.ts` says what must exist, `project setup` applies it and `doctor project`
compares it with the live board (the server-as-code pattern, #1098; the doctor rules are
in `tech-doctor-deep-checks`). A template is the default layout, so `layout` only
states what differs.

```ts
providers: {
  projects: ["github", {
    number: 5, // the board this repo uses; setup creates one from `template` when absent
    template: "roadmap",
    layout: { /* fields, options and views, same shape as a template */ },
  }],
}
```

**`setup` is idempotent and never destructive.** It reads the board, computes the difference
and applies only that: `createProjectV2` (or `copyProjectV2` from a template board),
`createProjectV2Field`, `updateProjectV2Field`, `createProjectV2View` and
`updateProjectV2View`. A field, option or view the layout does not mention is left alone
and reported by the doctor, never deleted.

**A field change keeps its values.** `updateProjectV2Field` replaces the whole option list.
`ProjectV2SingleSelectFieldOptionInput` takes an optional `id`, documented as "include this to
preserve the option's identity during updates, preventing item field values from being cleared".
So `setup` reads the field first and sends every existing option with its `id`, in the order
declared, adding the new option without one. Renaming an option is the one change that
needs care (the name is how setup matches it when the `id` is unknown), so a rename is applied
as an `id`-preserving update, never as remove-and-add. If the live field cannot be read, setup stops
instead of sending a list without ids. Before any field write it also keeps a snapshot of the
field's values in memory and, if a re-read after the write shows a value gone, writes the
snapshot back by option name and reports it as a failure. This is the net, not the plan.

**What the API cannot do** is reported as a `todo` that fails the run until done, like the
Discord client secret. As of the live schema (checked 2026-11-05):

| Can be declared and applied                                   | Cannot                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| the board, its title, readme and short description            | creating an automation rule (`deleteProjectV2Workflow` exists, there is no create) |
| fields and single select options (colour, description)        | turning a rule on from a layout, so "Auto-add sub-issues" is a `todo`              |
| views: name, layout, filter, group-by (`createProjectV2View`) | a view's column order beyond what `configuration` accepts                          |
| linking the board to a repository or team                     |                                                                                    |
| closing, or marking as a template (`markProjectV2AsTemplate`) |                                                                                    |

`copyProjectV2` copies a board's fields and views into a new one. Whether it also copies the
automation rules is not verified; the first implementation should test it on a scratch board
before relying on it.

**`doctor project`** is read-only: one row per comparison (board exists and is open; each field
exists with its options in order; each declared view exists with its layout and filter; the
automation rules the layout lists are enabled; the board is linked to the repo), printed
through the shared `printCheckRows`. It also reports `item without a status` and
`closed item not Done` as `info`, which are the two things that made a hand clean-up
necessary.

**`project move`** carries items from one board to another by rule: every **open** issue or
pull request moves with its status and priority, and a closed or merged one stays behind, set to
`Done` on the old board when it still shows another status. An item already on the target keeps its
target values. This is the clean-up done by hand when v4 became v5, and is what `project close`
is followed by when a board is retired. It is a probe-style command (it writes, so it asks
first and honours `--dry-run`).

---

## Implementation

### File layout

The GitHub work is a capability in the GitHub plugin, in the shape of the other capabilities;
the commands in the CLI only orchestrate (`--dry-run` flows through `RuntimeContext`).

```
plugins/holocron-plugin-github/src/capabilities/
  projects.ts       ← the `projects` capability: list, ensure, read, close, move
cli/cli/src/commands/project/
  project.ts        ← yargs parent command + subcommand registration
  list/  create/  close/  setup/  move/   ← one folder each (implementation, test, index.ts)
  templates/
    roadmap/        ← built-in roadmap definition
    sprint/         ← built-in sprint definition
cli/cli/src/commands/deep-checks/
  project/          ← the `doctor project` entry in `DEEP_CHECKS`
```

A new capability needs `COMMAND_CONTEXTS` and `COMMAND_REGISTRY` entries, and a `DEEP_CHECKS` entry
needs the same (the tests fail without them). The capability is the seam a future Linear or
Jira provider plugs into.

The `Projects` capability decouples the command layer from the GitHub GraphQL
implementation. The commands call its methods; the GitHub plugin does the GraphQL work.

```ts
export interface Projects {
  list(org: string): Promise<ProjectSummary[]>;
  create(org: string, title: string, template: ResolvedTemplate): Promise<CreatedProject>;
  close(org: string, number: number): Promise<void>;
  /** The live board as a layout, with option ids, for `setup` to diff and `doctor` to compare. */
  read(org: string, number: number): Promise<BoardState>;
  /** Apply the difference between a layout and `read()`. Optional: a provider may only list and close. */
  ensure?(org: string, number: number, layout: ResolvedTemplate): Promise<EnsureReport>;
  /** Move open items from one board to another. Optional. */
  move?(org: string, from: number, to: number): Promise<MoveReport>;
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

**`close` — mutation.** There is no `closeProjectV2`; a board is closed, and reopened, with
`updateProjectV2(input: { projectId, closed: true })`.

**`update` — field options.** `updateProjectV2Field(input: { fieldId, singleSelectOptions })`,
each existing option sent as `{ id, name, color, description }` (see
[Declared board](#declared-board-apply-and-check)).

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

1. **Title uniqueness scope** — collision check is org-wide. If the same org
   runs multiple teams with projects named "Sprint 1", this will false-positive.
   Could scope to open projects only, or skip the check entirely and let GitHub
   create duplicates.

2. **Does `copyProjectV2` copy the automation rules?** If it does, `create` can copy a
   template board and the "Auto-add sub-issues" rule needs no `todo`. Test on a scratch
   board first; the schema documents fields and views only.
3. **Where does the declaration live?** `providers.projects` in `holocron.config.ts` suits
   one board per repo. The org board is shared by many repos; if the other repos need to
   name it, the number belongs in one shared place (the `peers`-style shared config), not
   in each repo.
4. **How is "open item" decided for `project move`?** The issue or pull request state
   (`OPEN`) is exact, but a closed item with a stale status was found on the old board
   (four of them), so `move` also sets those to `Done` on the board it leaves. Decide whether that
   write belongs in `move` or only in the doctor's `info` row.
5. **A second status for the dependency?** `Blocked` is a manual status. GitHub's "blocked by"
   link is the source of truth; the doctor could report an item that has an open blocker but is
   not `Blocked`, or the reverse, as `info`. Whether a rule should set the status
   itself is left until the column has been used for a while.
