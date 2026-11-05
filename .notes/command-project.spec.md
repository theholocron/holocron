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

## Capability: `projects`

Project management is a **capability**, not GitHub code with a flag. A new `projects` capability
sits beside `issues` (the tracker capability that already normalizes an issue for GitHub and
Jira): `issues` is one issue, `projects` is the planning surface that holds them. The GitHub
plugin is the first provider; a Jira (or Linear) plugin implements the same interface, and
moving a repo between them changes the `providers.projects` entry and the plugin, nothing else.
That only holds if the capability, the template files and the commands speak a neutral
vocabulary and never a GitHub word.

| Neutral term | GitHub Projects v2                    | Jira                                          |
| ------------ | ------------------------------------- | --------------------------------------------- |
| board        | a Project                             | a board, over a project and a filter          |
| item         | an issue or pull request on the board | an issue                                      |
| field        | a field                               | a custom field                                |
| status       | a Status option                       | a status in the workflow, set by a transition |
| view         | a view (layout, filter, group-by)     | a saved filter or board configuration         |
| blocker      | the "blocked by" issue dependency     | the "is blocked by" issue link                |
| rule         | a project workflow (automation)       | an automation rule                            |
| template     | a board to copy, or a template file   | a project template                            |

Three things make the vocabulary carry across:

- **A status has a category.** A template names its statuses and gives each a category
  (`backlog`, `planned`, `active`, `blocked`, `done`). A provider maps the category to its own
  states (Jira groups statuses into To Do, In Progress and Done) and keeps the template's names
  where it can. The doctor and `move` read the category, so "closed and not done" does not mean
  "the option is called `Done`".
- **Setting a status is `setStatus(item, status)`.** GitHub writes a field value; Jira performs a
  workflow transition, which can refuse. The capability returns a result for the transition, as
  `Issues.transition` does, instead of promising a write.
- **An item is an `issues` key.** The capability moves and reports items by the same key the
  `issues` capability uses, so nothing in it knows what a GitHub node id is.

What the capability holds is the **declaration and the normalization**: the neutral types
(`BoardSummary`, `BoardState`, `BoardTemplate`, `BoardItem`), the template schema and its
validation, the diff between a template and a live board, and the `doctor project` rows. A
provider only reads, writes and maps. The commands in the CLI hold no provider logic. The
config stays what it is below: a list of templates to names, plus the provider's own options
(the owner, where the template files live). The `source` of a template (a board to copy) is the
one GitHub-shaped idea; it is optional, and a provider without a copy operation ignores it.

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

    // Tuple form — provider + the boards this repo's org keeps, as template → name
    projects: [
      "github",
      {
        org: "theholocron", // defaults to config.org
        boards: [{ template: "roadmap", name: "v5" }],
      },
    ],
  },
});
```

The config holds only that list: which template each board follows and what the board is called.
The template itself, its fields, options and views, is never written into `holocron.config.ts`
(see [Template system](#template-system)). A board is found by its name among the org's open
projects, so no project number is stored anywhere.

`providers.projects` is optional. When absent, `holocron project` resolves
the provider from the `config.org` owner type — if the org is a GitHub org,
`"github"` is assumed. An explicit provider entry is only required to supply
options.

Future providers (`"linear"`, `"jira"`) would be plugged in here without
any change to the `holocron project` command surface.

---

## Template system

Templates define the structure of a project board. They are files, not config. Two sources are
read at runtime: the built-in presets that ship in `@theholocron/cli`, and a repo's own
templates, one `<name>.json` per template in a directory (`templates` provider option,
default `.holocron/projects`). A repo template with a built-in's name replaces it.

### Built-in templates

#### `roadmap` (default)

Mirrors the current org roadmap board (project 5, "v5"; v4 was closed on 2026-11-05):

| Component  | Definition                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **Fields** | Status (Someday / Todo / In Progress / Blocked / Done), Priority (1 · Now / 2 · Next / 3 · Process), Milestone (text) |
| **Views**  | Active (default), Backlog, Done — see below                                                                           |

`Blocked` is a status for an item that waits on another issue or an outside change.
The dependency itself is the issue's "blocked by" link; the column only makes it visible.
Each status carries a category (see [Capability: `projects`](#capability-projects)):
Someday is `backlog`, Todo `planned`, In Progress `active`, Blocked `blocked`, Done `done`.

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

A template file may set `extends: "<built-in-name>"` to inherit all
fields and views from a built-in and add to them (a `roadmap` with one more field is the
built-in and a `fields` list of one). Without `extends`, the template is fully custom and
must define all fields and views. A template may also name `source`, a board to copy from
when the board is created, which is how the automation rules come across (see below).

---

## Declared board: apply and check

A board is declared the way the notifications server is: the provider's `boards` list in
`holocron.config.ts` says which boards must exist and which template each follows,
`project setup` applies it and `doctor project` compares it with the live board (the
server-as-code pattern, #1098; the doctor rules are in `tech-doctor-deep-checks`). The
template file holds the layout, so the config stays a short list.

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
| fields and single select options (colour, description)        | switching a rule on or off on an existing board                                    |
| views: name, layout, filter, group-by (`createProjectV2View`) | a view's column order beyond what `configuration` accepts                          |
| linking the board to a repository or team                     |                                                                                    |
| closing, or marking as a template (`markProjectV2AsTemplate`) |                                                                                    |

**`copyProjectV2` copies the automation rules too.** Tested on 2026-11-05 by copying v5 to a
scratch board (since deleted): the copy had the same Status options (including `Blocked`), the
same three views and filters, and all seven automation rules with the same on/off state
(only "Auto-add sub-issues to project" on); it had no items. So a board created from a
template with a `source` carries its rules, and nothing about them is left as a `todo`. A
board built from the template file alone has no rules, and `setup` reports each one the
template lists as a `todo` (the table above), because the API cannot create them.

**`doctor project`** is read-only: one row per comparison (board exists and is open; each field
exists with its options in order; each declared view exists with its layout and filter; the
automation rules the layout lists are enabled; the board is linked to the repo), printed
through the shared `printCheckRows`. It also reports `item without a status` and
`closed item not Done` as `info`, which are the two things that made a hand clean-up
necessary.

**`project move`** carries items from one board to another by rule: every **open** issue or
pull request moves with its status and priority, and a closed or merged one stays behind, and
`move` sets it to `Done` on the old board when it still shows another status, so nobody has to
run the doctor to fix a board. (The doctor only reports; `move` fixes what it touches.) An
item already on the target keeps its target values. This is the clean-up done by hand when v4 became v5, and is what `project close`
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

The `Projects` capability decouples the command layer from any one tracker. The commands call
its methods; the plugin does the provider's own work (GraphQL for GitHub, REST for Jira). Names
are neutral: an `owner` is a GitHub org or a Jira site, a board is found by its name, and an
item is an `issues` key.

```ts
export interface Projects extends ProviderIdentity {
  /** Identifies this provider as the `projects` capability. */
  readonly key: "projects";

  list(owner: string): Promise<BoardSummary[]>;
  /** An open board by exact name, or undefined. */
  find(owner: string, name: string): Promise<BoardSummary | undefined>;
  create(owner: string, name: string, template: BoardTemplate): Promise<BoardSummary>;
  close(owner: string, board: BoardSummary): Promise<void>;

  /** The live board as a template, with whatever ids the provider needs, for `setup` to diff and `doctor` to compare. */
  read(owner: string, board: BoardSummary): Promise<BoardState>;
  /** Apply the difference between a template and `read()`. Optional: a provider may only list and close. */
  ensure?(owner: string, board: BoardSummary, template: BoardTemplate): Promise<EnsureReport>;

  /** The board's items with their status category and whether the issue is open. */
  items?(owner: string, board: BoardSummary): Promise<BoardItem[]>;
  /** Idempotent; `transitioned: false` when the item is already there. May refuse (a workflow). */
  setStatus?(owner: string, board: BoardSummary, key: string, status: string): Promise<LifecycleResult>;
  /** Move open items from one board to another. Optional. */
  move?(owner: string, from: BoardSummary, to: BoardSummary): Promise<MoveReport>;
}
```

The optional methods follow the other capabilities: a provider that cannot do one is skipped
cleanly, and `holocron project` says which command it cannot run.

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

## Decisions

1. **Title collision scope (decided).** The check on `create` looks at **open** projects only,
   so a closed board (v4) never blocks reusing its title. Boards are found by name among the
   open ones.
2. **`copyProjectV2` and the automation rules (tested).** It copies them, with their on/off
   state. See [Declared board](#declared-board-apply-and-check).
3. **Where the declaration lives (decided).** In `providers.projects`, as a short `boards` list of
   template → name. Templates are files (built-ins in the CLI, a repo's own in a directory), never
   inline config, and no project number is stored: a board is found by name.
4. **A `projects` capability, with a neutral vocabulary (decided).** Project management is a
   capability beside `issues`, so a move to Jira changes a provider entry and a plugin and
   not the commands, the templates or the config. See [Capability: `projects`](#capability-projects).
5. **Who fixes a stale status (decided).** `project move` writes it (a closed item left on the old
   board becomes `Done`). `doctor project` stays read-only and only reports.

## Open questions

1. **Should anything keep `Blocked` in step with GitHub's "blocked by" link?** The link is the real
   dependency (an issue can be blocked by another); the `Blocked` status is only a column
   that makes it visible, and today it is set by hand. They can disagree: an issue with an open
   blocker sitting in `Todo`, or one in `Blocked` whose blocker has closed. The proposal is that
   `doctor project` reports both as `info` and nothing sets the status automatically, until
   the column has been used for a while. The alternative is a rule that sets it from the link.
