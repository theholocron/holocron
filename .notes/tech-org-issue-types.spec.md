---
id: SPEC-0106
status: draft
issue: theholocron/holocron#2512
blocked-by: []
related:
  - theholocron/holocron#2430
  - theholocron/holocron#2485
  - theholocron/holocron#2429
  - theholocron/holocron#2494
  - theholocron/holocron#2495
  - theholocron/holocron#2488
  - theholocron/holocron#2511
discussion:
  url: https://discord.com/channels/1303969001822486568/1573240841978249246
---

# Declare the organization's issue Types in config and create them with `apply issue-types` and `setup`

> Design only. No code, no organization change and no live call is made by the pull request that carries this file. Repository facts were read from `alpha`; the GitHub REST facts come from GitHub's documentation (read 2026-11-19), not from a call. Everything the documentation does not settle is under "Not verified".

## Problem

The organization's issue Types are made by hand in the organization settings. Three exist (Bug, Feature, Task). We want two more: **Spike** (time-boxed research) and **Epic** (a body of work made of several issues). Today four things are fixed to the three:

- `IssueKind = "bug" | "feature" | "task"` (`cli/cli/src/plugin/capabilities/capabilities.type.ts`), the type of `IssueFields.kind` on `Issues.create` and `Issues.update` and of `IssueRecord.kind` (spec `tech-issue-kind-on-record`).
- `--type` has `choices: ["bug", "feature", "task"]` on `start work` (`start-work.command.ts`, and the menu entry `start-work.entry.ts`), on `new issue` and `update issue` through `addIssueFieldOptions()` (`commands/issue-fields/add-issue-field-options/`, and `issue-field-menu-options.ts`), and `update issue --type epic` is tested as a refusal (`issue-update.command.test.ts`). `work-title.ts` maps each kind to a Conventional Commit type (`bug` to `fix`, `feature` to `feat`, `task` to `chore`).
- The GitHub plugin's `KIND_TYPE_NAMES` (`plugins/holocron-plugin-github/src/capabilities/issue-kind.ts`) is `Record<IssueKind, string>`; `writeKind()` sends the name through `updateIssue(..., { type })`, and `kindOfIssue()` reads it back with a closed lookup. The backfill (`probes/issue-types/`) has its own tables, `repo.labels.kinds` and `fallbackKinds` (default `bug` to Bug, `enhancement` to Feature, `chore` to Task, then six labels to Task) and checks them against the organization's Types with `typeNames()` (a GraphQL read of `organization.issueTypes`) and `unknownTypes()`.
- Linear has no Type, so its kind is a label: `KIND_LABELS = { bug: "bug", feature: "enhancement", task: "chore" }` (`plugins/holocron-plugin-linear/src/capabilities/issues-update.ts`), read back by `issue-kind.ts` there.

A Type that exists in the organization but not in that union cannot be set by any command, and a Type declared nowhere in the repo cannot be reviewed, compared or recreated. The organization settings are the only place the list lives.

## Goals and non-goals

Goals: one declaration of the Types in the repo; a command and a `setup` step that make the missing ones and never delete, rename or overwrite a person's edit; a `doctor` row that compares the declaration with the organization; the kind commands, the backfill and Linear learn the declared Types instead of a closed union; rules for choosing a Type.

Non-goals: deleting, renaming or re-ordering a Type (GitHub documents a delete call; we never use it); issue fields, project fields or labels other than `epic`; a Type on a pull request (Types are issue-only, as `tech-github-area-labels` already says); running anything against the live organization (the maintainer runs `apply issue-types --dry-run`, then the real run).

## Decisions (maintainer, 2026-11-19)

Answers to the twelve open questions of the first draft; the sections below say how each is built.

1. **Declaration:** the `org` area, a top-level `issueTypes` in `.holocron/org.ts`.
2. **Capability:** optional methods on `Issues`, not `Source`.
3. **Verb:** `holocron apply issue-types` **and** a `setup` step that calls the same function. The step runs only when the org area declares `issueTypes`, creates only the missing Types (never updates, deletes or renames), is a `skip` row naming the missing permission when there is no token or the call is refused (never a failure), and honours `--dry-run` and asking first. The explicit `apply issue-types` remains for `--update` and for checking.
4. **Token:** reuse `HOLOCRON_ORG_TOKEN` (`github.org`) for read and write. There is no new token. It needs the organization permission **Issue types: read and write**, and the user an organization admin.
5. **`apply issue-types --update`** is included: description and colour only, never `enabled`, asked first. A Type that exists is otherwise left alone.
6. **Drift** in description or colour is an `info` row in `doctor repo`, never a failure; a missing declared Type fails.
7. **`IssueKind`** is the core three (`bug`, `feature`, `task`) plus the declared extras; `--type` validates after parsing against them. A new section, "Choosing a Type", sets the rules, and they go into the agent guidance next to the effort skill. **There is no Spec Type**: a spec-only issue uses Task, a feature with a spec stays Feature.
8. **The declaration carries** an optional `label` (Linear; default the lower-cased name) and an optional `commit` (the commit type `start work` uses).
9. **Linear:** a Type with no label is a `dropped` row (`kind spike (not carried: no Linear label)`); `migrate` and `sync` never create labels; only `provider linear setup` does.
10. **The `epic` label** is retired only after the Epic Type exists, `repo.labels.kinds` maps `epic` to Epic and the backfill has typed the one issue that carries it. Then it leaves `CANONICAL_LABELS`, never deleted. Linear is unaffected (its `epic` label comes from the Type's `label`).
11. **Declared Types** are Bug, Feature, Task, Epic and Spike. Epic: purple, "A body of work made of several issues". Spike: orange, "Time-boxed research that ends in a finding, not a change". Bug, Feature and Task keep GitHub's current values, to be read from `apply issue-types --dry-run`; their colours below are placeholders from memory.
12. **The pre-write limit check** stays: GitHub's documented 25, counting existing plus new Types including the three defaults; the 25 is listed as unverified.

## What exists today to match

- **`holocron apply properties`** (`commands/repo-properties/run-properties-apply/`) is the precedent for an organization-wide write that is its own deliberate step: `Source.getOrgPropertyValues` / `addOrgPropertyValues`, a read-only `doctor repo` row (`repo-capabilities-allowed`) that names the command, `--dry-run` that only reads, an ask first (`--yes` skips it, no terminal throws `NonInteractiveError`), adds only. `setup` does not write the property schema; Types differ (Decision 3) because the declaration is opt-in per repository, see "The verb".
- **The `org` area** (`.holocron/org.ts`, `OrgConfig`, `placeOrg()`): the one shared area (`SHARED_AREAS`), constants CI does not need, names and identifiers only, a key set both inline and in the file is an error, and a config in a subdirectory reads the root's `org` and may override a key. `placeOrg()` fills provider options and sets `config.domain` when the config leaves it out.
- **`tech-org-secret-visibility`** is the precedent for fail closed on an organization-wide write.
- **`tech-github-area-labels`** decided that on an issue the kind is the Type, that kind labels stay on pull requests, that the other kind labels map to Task (Final answers 7), that the backfill's tables are configuration (8), and that `epic` is a synced label with no Type of its own. This spec gives `epic` a Type.
- **`tech-issue-kind-on-record`** put `kind` on `IssueRecord`; the GitHub import and `sync` write it as the Type, Linear writes the kind label. A Type GitHub refuses (401, 403, 404, 422) is a `dropped` line, never a failure. That rule stays.
- **`.notes/tool-work-commands.spec.md`** introduced `--type` on `start work`, deciding the commit type from the kind.
- **The loader hands every plugin `repoValidation.docsCoverage` as an option.** There is a precedent for a config value reaching every plugin without the plugin reading the config.
- **`skills/src/work-effort/SKILL.md`** (#2488) is the precedent for telling an agent how to choose a field value the CLI never infers.

## Design

### 1. The declaration

A top-level `issueTypes` list in the `org` area (`.holocron/org.ts`, `OrgConfig.issueTypes`), placed by `placeOrg()` into `config.issueTypes` when the config leaves it out (the way `domain` is, #1877), the loader handing it to the issues plugins as the option `issueTypes`.

```ts
interface OrgIssueType {
  /** The Type's name, the key. Case-insensitive unique. */
  name: string;
  /** One line; shown in GitHub's settings. */
  description?: string;
  /** GitHub's colour word: gray, blue, green, yellow, orange, red, pink or purple. */
  color?: string;
  /** Whether new issues may take it. Default true. */
  enabled?: boolean;
  /** The Linear label that stands for it. Default: the name in lower case. */
  label?: string;
  /** The Conventional Commit type `start work` uses for it. Default: none (see below). */
  commit?: string;
}
```

All five are declared so the declaration is complete (an existing Type is declared too and is only compared, never rewritten, unless `--update`). The three existing rows copy what the organization has today, which this spec could not read, so their description and colour are placeholders until a read of `apply issue-types --dry-run` replaces them:

| Name    | Description                                              | Colour                 | `label`       | `commit` |
| ------- | -------------------------------------------------------- | ---------------------- | ------------- | -------- |
| Bug     | An unexpected problem or behavior                        | `red` (placeholder)    | `bug`         | `fix`    |
| Feature | A request, idea, or new functionality                    | `blue` (placeholder)   | `enhancement` | `feat`   |
| Task    | A specific piece of work                                 | `yellow` (placeholder) | `chore`       | `chore`  |
| Epic    | A body of work made of several issues                    | `purple`               | `epic`        | none     |
| Spike   | Time-boxed research that ends in a finding, not a change | `orange`               | `spike`       | none     |

`commit` for Epic and Spike is absent on purpose (Decision 8): `start work` falls back to `chore` unless the issue's title already carries a Conventional Commit prefix, which then wins.

Why the `org` area:

- Types are organization-wide, not repository-wide, which is what `org` is and what `repo` is not; it is the only shared area, so `apps/sentinel`'s config sees the same list.
- It is names and descriptions, no secret, and CI does not need it, which is the area's rule.
- No new closed-list area name and no `HOLOCRON_AREAS` change. Sentinel's remote config check must accept the new top-level key (rollout 1).

A name that repeats ignoring case, a `color` that is not one of GitHub's eight words, or a `commit` that is not a Conventional Commit type is a `ConfigError` naming the path, at load.

### 2. The capability and its methods

Three optional methods on `Issues` (Decision 2):

```ts
interface IssueTypeInfo { id: number | string; name: string; description?: string; color?: string; enabled: boolean }

// on Issues, all optional
listTypes?(): Promise<IssueTypeInfo[] | undefined>;                       // undefined: cannot be read
createType?(type: OrgIssueType): Promise<IssueTypeInfo>;                  // never replaces
updateType?(id: IssueTypeInfo["id"], patch: { description?: string; color?: string }): Promise<void>; // --update only
```

A Type is a tracker concept, and a tracker with no Type (Linear) leaves the three methods out; the CLI says so. The cost: `Issues` is the capability the shared `HOLOCRON_ISSUES_TOKEN` (`issues: read/write`) resolves for, so the plugin must route these three methods to `HOLOCRON_ORG_TOKEN` (a plugin-internal feature word, as it holds nine tokens already). That the existing feature resolver can split one capability across two tokens is Not verified (see below).

GitHub's calls, as documented (REST, `Issue types` group): `GET /orgs/{org}/issue-types`, `POST /orgs/{org}/issue-types` (body `name`, `is_enabled` required; `description`, `color` optional; `color` one of `gray`, `blue`, `green`, `yellow`, `orange`, `red`, `pink`, `purple`, or null), `PUT /orgs/{org}/issue-types/{issue_type_id}` (same body). There is also a `DELETE`, which the client group does not wrap at all: a method that is not there cannot be called by mistake, and a test pins its absence. `clients/github-client` gets an `issueTypes` group with `list`, `create` and `update` only.

Rules, all from the issue:

- **Never delete, never rename.** `updateType` sends the Type's current name back (the documented `PUT` body requires `name` and `is_enabled`), so a rename cannot happen; a Type is matched by name case-insensitively, and one whose name differs only by case is "exists", not a second one.
- **A Type that exists is left alone**, whatever its description, colour or enabled flag. A person's edit in the settings is never overwritten by a default run.
- **`--update`** (Decision 5) also sets `description` and `color` on an existing declared Type whose value differs, only a field the declaration states. It lists each change first (`was` and `to`) and asks first like the create. It never changes `enabled` (turning a Type off or on hides it for everyone; a declared Type that is turned off is reported, and a person flips it).
- **Idempotent.** A second run changes nothing. A create that answers 409 or 422 for a name that now exists (a race with a person or a second run) is read as exists after one more `list`; any other 4xx is a failing row.

### 3. The verb: `apply issue-types` and a `setup` step

Both call one function, `ensureIssueTypes()` (`commands/issue-types/`, one function per file), which reads the list, computes what is missing (and, with `update`, what differs), and writes through the capability. The two callers differ only in their options and in how a refusal reads.

**`holocron apply issue-types [--update] [--yes] [--dry-run]`** is the explicit command: a `workspace` command (`assertPluginsResolvable`), entries in `COMMAND_CONTEXTS` and `COMMAND_REGISTRY`, a decision for each option in `command-options.test.ts`. It is the only place `--update` exists, and the place to check: with no declaration it is a `skip` row, with no token or a refusal it is a `fail` row (a person who ran it wanted it done).

**The `setup` step** (`issueTypesStep()`, `commands/setup/issue-types-step/`, an `issue-types` section) is the same call with `update: false`:

- It runs **only when the org area declares `issueTypes`**, so a repo that declares nothing is unchanged. Other repositories only create Types if their own org area declares them; this repo (`theholocron/holocron`) is the one that makes them, and no other repo's `setup` touches the organization's list.
- It creates **only the missing** Types: never an update, a delete or a rename.
- No token, a 401 or 403, or a provider with no `createType` is a **`skip` row** naming the missing permission (organization **Issue types: write** on `HOLOCRON_ORG_TOKEN`, and an organization admin), **never a failure**, so a `setup` by a contributor without the permission still passes.
- `--dry-run` reads and prints only. It asks first (`--yes` skips the question) before any create; without a terminal and without `--yes` the step is a `skip` row saying to pass `--yes` rather than the `NonInteractiveError` `apply` throws, because `setup` runs many steps and one organization-wide question must not abort the rest (Open point 2).

The earlier draft said `setup` never writes Types, as it never writes the property schema. That reasoning held for a write every repo's `setup` would race on; it does not hold now that the step is opt-in by the org area, creates only, and degrades to a skip. The properties precedent is still why the explicit command exists and why `--update` is never part of `setup`.

| Option                                               | Cost                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`apply issue-types` and a `setup` step (decided)** | Two callers of one function, so one code path. A fresh organization is made by the normal `setup` and the explicit command stays for `--update` and for checking. The cost is the second caller's different refusal wording, and that a `setup` with the token creates organization-wide state. |
| `apply issue-types` only                             | Matches `apply properties`, but `setup` of a new organization would not make its Types and the declaration would be applied by memory.                                                                                                                                                          |
| A `setup` step only                                  | No home for `--update` or a deliberate check.                                                                                                                                                                                                                                                   |

### 4. The token and least privilege

GitHub documents the write as needing an administrator of the organization, and for a classic token the `admin:org` scope; list needs `read:org`. The issue states the fine-grained form as organization admin plus **Issue types: write** (**read** for the read). The shared `HOLOCRON_ISSUES_TOKEN` (`issues: read/write`, `metadata: read`) stays narrow: an organization-wide write on it would let a stolen issues token redefine the vocabulary of every issue.

**Decision 4: reuse `HOLOCRON_ORG_TOKEN` (`github.org`) for the read and the write. There is no new token.**

What the code and `docs/src/content/docs/tokens.mdx` say today about that token:

- Documented as Fine-grained (org): resource owner org, `administration: write`, `members: read`, organization `variables: read/write`, and, since #2511 (PR #2514), organization **Issue types: read** for the backfill only, in prose. The note under its section also says write access to issue types is "deliberately not granted" and that the maintainer creates the Types in the settings. That sentence is wrong once this lands.
- Declared in the plugin's `expect` (`probes/token/expectations.ts`) as `everywhere(...)`: `administration` required, `org-members` required, `org-variables` required, `org-secrets` absent, in `local`, `dev` and `ci`. So the declaration expects every layer, `ci` included, to hold it.
- **CI holds it.** `.holocron/repo.ts` lists `HOLOCRON_ORG_TOKEN` in a `repo.secrets.sync` entry for the `ci` layer, scope the organization secret, readable by `theholocron/holocron` and `theholocron/.github`; `holocron.config.ts` lists it too (the `dev` list). The reusable workflows pass it in: `check-tokens.yml` and `sync-repo.yml` (`HOLOCRON_ORG_TOKEN: ${{ secrets.HOLOCRON_ORG_TOKEN }}`); `reconcile-projects.yml` sets the same name from a GitHub App token instead.
- **Plainly: adding Issue types: write to the token adds that write permission to the secret CI reads.** Any workflow of `theholocron/holocron` or `theholocron/.github` that can read organization secrets holds a token able to create organization issue Types. It cannot delete or rename (the code never calls those, and the client has no method), and creating a Type is low-impact, but it is a write to a shared organization setting from a token that today only writes team and variable state. This is a risk and an open point for the maintainer (Open point 1); this spec does not decide it.

Two ways the maintainer could narrow it, listed only so the open point has options (neither is chosen): (a) keep one token and accept it; (b) give the `ci` layer's Environment a `HOLOCRON_ORG_TOKEN` value that holds Issue types: **read** only while `local` holds read and write (the layers are separate 1Password Environments, `doctor secrets --shared` already reports values shared across them, and a probe judges one token per layer by the same rules, which is why the permission stays in prose below).

What `tokens.mdx` and the `github token` probe then need:

- **`tokens.mdx` summary row of `HOLOCRON_ORG_TOKEN`:** the organization **Issue types: read** clause becomes **Issue types: read/write** (`apply issue-types`, the `setup` step and `doctor repo`; the backfill reads only), and "Used by" adds the Types.
- **The note under `#### HOLOCRON_ORG_TOKEN`:** replace the "deliberately not granted" sentence with the write: creating needs the organization admin and **Issue types: write**; `apply issue-types --update` uses the same; the `setup` step is a `skip` when it is missing; and state plainly that `ci` holds this token (the risk above) and what the maintainer decided.
- **No new table row and no change to `expect`.** A `TokenExpectation` rule is only `required` or `absent` and `docs tokens` fails a table row that is not declared (the reason #2514 / #2511 left the read in prose), and the write is needed by one person on a laptop, not by every layer: `required` would turn `doctor tokens` red for every layer lacking it, `absent` would be wrong. Both permissions therefore stay prose, with a pointer from the table.
- **The `github token` probe:** `permissions.ts` already has the `issue-types` read (`/orgs/{o}/issue-types`, `info` when refused, with no layer; added in #2514). It stays the one read. A read proves visibility, not write, which the page says of every row; the write is proved only by the first real `apply issue-types`, whose dry run reads and so does not prove it either. Nothing is added to the probe, and no `Issue types` row to the per-token table.
- **`docs tokens`:** unchanged (no table change). **Environment layers:** none new; the write belongs to the `local` layer's copy of the token, and whether `ci` keeps it is Open point 1.
- The new `doctor repo` row reads with this token, so it also needs Issue types: **read** where it runs; a 401 or 403 is a skip naming the permission.

### 5. The `doctor` row

`doctor repo` gains a row `issue-types` (the home of `repo-capabilities-allowed`: an organization comparison that names its fixing command). Read only, no write:

- **A declared Type that the organization lacks: `fail`**, naming it and `holocron apply issue-types` (or `setup`).
- **An undeclared Type the organization has: `info`**, by name (a person's own Type is not wrong).
- **A declared Type with a different description or colour: `info`**, by field (`was`, `declared`), naming `apply issue-types --update`. A declared Type that is turned off is an `info` row. Drift is never a failure (Decision 6).
- A list that cannot be read, a provider with no `listTypes`, or no declaration: a `skip` with the reason. No declaration is not a failure.
- It prints names, counts and colours only; no token or id.

### 6. Making the kind open

`IssueKind` stops being a closed union and the places that fix it learn the declaration (Decision 7): the core three that the CLI always knows, plus the declared extras. The core set is what `start work` and `sync issues` work with when no declaration exists.

- **Type.** `type CoreIssueKind = "bug" | "feature" | "task"` and `type IssueKind = CoreIssueKind | (string & {})`. A kind is the Type's name in lower case; `Epic` is `epic`. The valid kinds for a run are `CORE_KINDS` plus the lower-cased declared names, built by one function `issueKinds(config)` in the CLI (`commands/issue-fields/`) that is the only place that list lives. A declared name equal to a core one is the core one (Bug is `bug`).
- **`--type`.** `start work --type`, `new issue --type` and `update issue --type` drop the static `choices` and validate after parse with `issueKinds(config)`, which names the valid words on a miss. Static `choices` would need the config loaded in the yargs builder, the wrong place, and would break `--help` in a clone with no config. The cost: `--help` cannot list the declared extras; the describe text says "bug, feature, task or a Type the organization declares". The interactive menu entries (`start-work.entry.ts`, `issue-field-menu-options.ts`) take the core three plus the declared names when the menu can read the config; whether an entry can compute `choices` at run time is Not verified, and the fallback is the core three plus `epic` and `spike` named in the entry. The existing test that expects `--type epic` to be refused changes: `epic` is refused only when it is not declared.
- **Commit type.** `work-title.ts`' `KIND_TYPE` becomes the declared `commit`, the core three fixed as today. For Epic and Spike (no `commit`) `start work` uses `chore` unless the title already starts with a Conventional Commit prefix, which wins. An issue with no Type keeps `chore`.
- **GitHub plugin.** `KIND_TYPE_NAMES` and `TYPE_KINDS` are built from the declared names plus the core three (the loader's `issueTypes` option). `writeKind()` sends the declared spelling (`Epic`), not the lower-case kind; refusal handling is unchanged (a Type the organization lacks is a `dropped` line, 422 as the earlier spec assumed). `kindOfIssue()` maps a Type outside the list to its lower-case name instead of `undefined`, so a migration does not lose an Epic.
- **Backfill.** `repo.labels.kinds` and `fallbackKinds` already take any Type name (`resolveKinds()` is a string table) and `unknownTypes()` already reports one the organization lacks, so the backfill needs no code to use a new Type. `DEFAULT_MAIN_KINDS` stays the core three. This repo's `.holocron/repo.ts` gains `epic: "Epic"` in `kinds` in the change that retires the label (section 8). The backfill, like every inference here, never overwrites a Type already set.
- **Linear** (Decision 9). `KIND_LABELS` becomes the core three plus each declared Type's `label` (default the lower-cased name: `epic`, `spike`). `labelsFor()` and `kindOfLabels()` read that table, and `provider linear setup` makes each declared label with the colour `colorOf()` takes from `CANONICAL_LABELS` by name, else the declaration's colour word mapped to a hex (a small table, one place). A Type the plugin has **no label for** (a kind the declaration lacks, or a Linear `labels` option that omits the declared label) is a `dropped` row, `kind spike (not carried: no Linear label)`, never a failure. `migrate` and `sync` never create a label; only `provider linear setup` does. Reading back, a label that is none of the table's is not a kind.

Option for the shape of the open set:

| Option                                           | Cost                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core three plus declared extras (decided)**    | Works with no declaration and in a clone; the type stays autocompleting for the three; two lists to read (`CORE_KINDS` and the declaration), joined in one function. |
| Derive everything from the declaration (no core) | One list, but `start work` and `sync issues` then fail with no `org` area, and every test must supply a declaration.                                                 |
| `IssueKind = string` with no core                | Loses the compile-time check that a branch handles every core kind (`work-title`, Linear's `KIND_LABELS`); a typo (`feture`) compiles.                               |

### 7. Choosing a Type

The CLI infers a Type in a few places (the backfill, `new issue`, `start work` with no `--type`) and an agent files issues by hand. One set of rules, so both agree:

| Type    | When                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Epic    | The title starts `epic(...)` (this repo's convention, for example `epic(comlink)`), **or** the issue has sub-issues or relations (a parent of others, or tracked by blocked-by links). |
| Spike   | **Never inferred.** Set by hand, or by an agent asked to do a research task whose result is a finding rather than a change.                                                            |
| Bug     | Something that worked or was meant to work is broken (the `bug` label, a `fix` title).                                                                                                 |
| Feature | New or changed behaviour a user sees (the `enhancement` label, a `feat` title). **A feature that has a spec stays Feature.**                                                           |
| Task    | Everything else (the `chore` label and the other kind labels, Final answers 7 of `tech-github-area-labels`). **A spec-only issue is a Task.**                                          |

There is **no Spec Type** (Decision 7): a spec is a document inside an issue's lifecycle, not a kind of issue. Precedence when more than one applies: an Epic signal wins over a label, a label over a title, and a Type already set wins over all of them: neither the backfill nor any inference overwrites a Type that is there (a person's choice, and the 184 that have one today). Two kind labels on one issue stay listed and left for a person, as the backfill does.

The rules also go into the agent guidance, next to `skills/src/work-effort/SKILL.md` (#2488): a pull request updates that skill with a section, or adds a sibling skill (`work-type`) that `holocron-skill-skill` makes, the decision being the implementer's. It says what the table says, tells the agent to pass `--type` and to state the reason in one line (as `work-effort` does), and never to infer Spike. The README table of skills and a `feat:` commit follow the `skills/` rules.

### 8. The `epic` label once an Epic Type exists

`epic` is a synced stock label (`CANONICAL_LABELS`: colour `5319e7`, "A body of work made of several issues"; 1 issue, 0 pull requests per `tech-github-area-labels`) and, once `label` is declared, Linear's kind label for an Epic. It is retired only after all three are true (Decision 10): the Epic Type exists (`doctor repo`'s `issue-types` row is `ok`), `.holocron/repo.ts` maps `epic` to Epic in `repo.labels.kinds`, and the maintainer-run backfill has typed the issue that carries `epic`. Then it is removed from `CANONICAL_LABELS` and stays out of `STALE_LABELS`; **it is never deleted**, and every attachment stays. Until then nothing changes, so no run is red between steps.

Linear is unaffected: Linear's `epic` label is made by `provider linear setup` from the Epic Type's `label`, and its colour falls back to the declaration when `colorOf()` no longer finds `epic` in `CANONICAL_LABELS`. The labels `epic` already on issues are never stripped (the same rule as the other kind labels). `docs` names the retirement in the stock-label table.

### 9. Dry-run, asking, idempotency, limits

- **`--dry-run`** reads the organization's list, prints each row (`would create Epic`, `exists Bug`, `would update Task description`), and writes nothing. It is the maintainer's first step, with the output attached to the issue before the real run.
- **Asking first.** `apply` and the `setup` step ask once before any write, listing every Type to create and every field to update (`confirm`, default no); `--yes` skips the question. Without a terminal and without `--yes`, `apply` throws `NonInteractiveError` ("changes the organization's issue Types; pass --yes"), and the `setup` step is a `skip` row (section 3). A cancel is a `skip` row and exits 0.
- **Idempotent and stop on error.** A re-run changes nothing. Rows go through `printCheckRows`, one per Type; a failing create is a row and the others go on; a rate limit stops the run cleanly and says what is left. Declared names are created in the declaration's order.
- **No declaration, no write.** A config with no `issueTypes` makes both callers a `skip` row, never a write of defaults.
- **The limit** (Decision 12). GitHub's documentation (managing issue types in an organization) says an organization can have up to 25 issue types, and that the default types are included in addition to the created ones. The REST page states no limit. Before it writes anything, `ensureIssueTypes()` counts the existing Types plus those it would create, **including the three defaults**, and if that is over 25 it stops with a `fail` row (a `skip` in `setup`) naming the count and writes none. Whether the defaults count toward the 25 is ambiguous in the text (Not verified), so the check counts them, which is the safe side. Five Types is far below either reading.

## Rollout

Each is its own pull request, with its tests and docs, in this order.

1. **The declaration and the open kind (no write, no GitHub call).** `OrgConfig.issueTypes`, `OrgIssueType`, validation (`ConfigError`s), `placeOrg()`, the loader option, `issueKinds()`, `IssueKind` open, `--type` validated after parse and the menu entries, `work-title` from `commit`, Linear's label table and the GitHub plugin's name table. Sentinel's `resolveConfig()` allows the new key. Docs: `cli/cli/README.md`, `AGENTS.md` (the `org` area bullet and the kind), the config docs page. This repo declares nothing yet, so nothing it generates changes.
2. **The client and the capability.** `clients/github-client` `issueTypes` (list, create, update; no delete, a test pins that), `Issues.listTypes/createType/updateType`, the GitHub implementation routed to `HOLOCRON_ORG_TOKEN`, and the `tokens.mdx` changes of section 4 (row and note; no `expect` change, no new probe read). The backfill's `typeNames()` read may move onto `listTypes()`; separate and optional.
3. **`apply issue-types` with `--update`.** `ensureIssueTypes()`, the command, its tests with hand-written fakes (no live service), `COMMAND_CONTEXTS`, `COMMAND_REGISTRY` and the menu decisions, the docs command page.
4. **The `setup` step.** `issueTypesStep()` over the same function, create only, a `skip` for a missing permission, a test that `setup` with no declaration is unchanged and that `probe generated check` is unaffected.
5. **The `doctor repo` row** (`issue-types`), its tests, `deep-checks` entries as needed.
6. **This repo declares the five** (`.holocron/org.ts`) (`epic: "Epic"` in `.holocron/repo.ts` waits for item 8). **Human steps, in order:** give `HOLOCRON_ORG_TOKEN` the organization permission Issue types: read and write (and be an organization admin), decide Open point 1 for `ci`, `holocron probe github token --environment local`, `holocron apply issue-types --dry-run`, attach it to the issue, replace the placeholders of the three existing rows from that read, `holocron apply issue-types` (or `holocron setup`), then `holocron doctor repo`.
7. **The agent guidance.** Update `skills/src/work-effort/SKILL.md` or add a sibling skill with "Choosing a Type" (section 7), and the README row; `.holocron/org.md` is not edited unless the rules must reach every repo.
8. **Retire the `epic` label.** After the backfill has typed the issue: `epic: "Epic"` in `.holocron/repo.ts`, then remove it from `CANONICAL_LABELS`, say so in the stock-label table, keep the label in the repositories.

Pull request 6 is held until the maintainer has the permission; 1 to 5 do not need it, and the doctor row is a skip until a declaration exists, so none is red between merges.

## Open questions for the maintainer

Resolved: all twelve questions of the first draft (Decisions 1 to 12). What the answers leave open:

1. **Does `ci` keep the write permission?** `HOLOCRON_ORG_TOKEN` is held by `ci` (organization secret read by `holocron` and `.github`, and passed to `check-tokens` and `sync-repo`), so Issue types: write on it reaches CI. Options: keep one token (simplest, widest); or let the `ci` layer's Environment hold a read-only value while `local` holds read and write (no code change; the layers are separate Environments). No recommendation is made: this is the maintainer's call on a token's blast radius.
2. **`setup` without a terminal and without `--yes`:** a `skip` row (written above) or `NonInteractiveError` like `apply`. Recommendation: the `skip` row, so one organization-wide question cannot abort the other `setup` steps.
3. **Should `epic` and `spike` be named in the menu fallback entries** (the core three plus the two) when a menu entry cannot read the config? Recommendation: yes.

## Not verified

- **No call to GitHub was made.** The endpoints, the body fields (`name` and `is_enabled` required, `description` and `color` optional, `color` one of eight words or null) and the `DELETE` are from GitHub's REST documentation, not a call. Whether `PUT` is a full replace (hence the "send the current name and enabled flag back" rule) or accepts a partial body is unknown.
- **The fine-grained permission.** The documentation lists the classic scopes (`read:org` for list, `admin:org` for create, update and delete, plus being an organization administrator). That a fine-grained token has an organization permission "Issue types" with read and write, and that it satisfies these calls, comes from the issue and #2514, not the documentation page read. The `tokens.mdx` wording is drafted on that assumption; the first real `apply issue-types` is the proof.
- **The limit.** The documentation says an organization can have up to 25 issue types and that the defaults (Task, Bug, Feature) are "in addition to these"; the REST page states no limit. Whether the 25 includes the defaults, and the error GitHub returns past it, is not verified.
- **What the three existing Types look like** (their descriptions, colours, whether each is enabled). The table in section 1 uses GitHub's defaults from memory; they are placeholders until `apply issue-types --dry-run` reads them.
- **Case sensitivity of `type` on an issue update.** `writeKind()` sends the declared spelling; whether GitHub matches a Type name case-insensitively is not verified.
- **What a create answers for a name that already exists** (409 or 422), and a rate-limit shape; the design reads either as "exists" after a `list`.
- **Whether `GET /orgs/{org}/issue-types` (REST) is readable with the Issue types: read permission** that the GraphQL read in the backfill already uses.
- **Whether the plugin's feature resolver can route three `Issues` methods to `HOLOCRON_ORG_TOKEN`** while the rest of `Issues` uses `HOLOCRON_ISSUES_TOKEN`; the plugin's `auth.ts` was read for the token list only.
- **Whether the interactive menu can compute a `choices` list from the loaded config at run time.** The fallback in section 6 does not need it.
- **That Sentinel's `resolveConfig()` and remote check accept an unknown top-level key**, or reject it; rollout 1 adds the key either way.
- **Linear.** Whether Linear accepts `spike` and `epic` as label names and how `epic` interacts with a Linear project concept is not verified; no Linear call was made.
