---
status: draft
issue: theholocron/holocron#2512
blocked-by: []
related:
  - theholocron/holocron#2430
  - theholocron/holocron#2485
  - theholocron/holocron#2429
  - theholocron/holocron#2494
  - theholocron/holocron#2495
---

# Declare the organization's issue Types in config and create them with `apply issue-types`

> Design only. No code, no organization change and no live call is made by the pull request that carries this file. Repository facts were read from `alpha` @ `2af5004d3`; the GitHub REST facts come from GitHub's documentation (read 2026-11-19), not from a call. Everything the documentation does not settle is under "Not verified".

## Problem

The organization's issue Types are made by hand in the organization settings. Three exist (Bug, Feature, Task). We want three more: **Spec** (an issue whose work is a design doc), **Spike** (time-boxed research) and **Epic** (a body of work made of several issues). Today four things are fixed to the three:

- `IssueKind = "bug" | "feature" | "task"` (`cli/cli/src/plugin/capabilities/capabilities.type.ts`), the type of `IssueFields.kind` on `Issues.create` and `Issues.update` and of `IssueRecord.kind` (spec `tech-issue-kind-on-record`).
- `--type` has `choices: ["bug", "feature", "task"]` on `start work` (`start-work.command.ts`, and the menu entry `start-work.entry.ts`), on `new issue` and `update issue` through `addIssueFieldOptions()` (`commands/issue-fields/add-issue-field-options/`, and `issue-field-menu-options.ts`), and `update issue --type epic` is tested as a refusal (`issue-update.command.test.ts`). `work-title.ts` maps each kind to a Conventional Commit type (`bug` to `fix`, `feature` to `feat`, `task` to `chore`).
- The GitHub plugin's `KIND_TYPE_NAMES` (`plugins/holocron-plugin-github/src/capabilities/issue-kind.ts`) is `Record<IssueKind, string>`; `writeKind()` sends the name through `updateIssue(..., { type })`, and `kindOfIssue()` reads it back with a closed lookup. The backfill (`probes/issue-types/`) has its own tables, `repo.labels.kinds` and `fallbackKinds` (default `bug` to Bug, `enhancement` to Feature, `chore` to Task, then six labels to Task) and checks them against the organization's Types with `typeNames()` (a GraphQL read of `organization.issueTypes`) and `unknownTypes()`.
- Linear has no Type, so its kind is a label: `KIND_LABELS = { bug: "bug", feature: "enhancement", task: "chore" }` (`plugins/holocron-plugin-linear/src/capabilities/issues-update.ts`), read back by `issue-kind.ts` there.

A Type that exists in the organization but not in that union cannot be set by any command, and a Type declared nowhere in the repo cannot be reviewed, compared or recreated in another organization. The organization settings are the only place the list lives.

## Goals and non-goals

Goals: one declaration of the Types in the repo; a command that makes the missing ones and never deletes, renames or overwrites a person's edit; a `doctor` row that compares the declaration with the organization; the kind commands, the backfill and Linear learn the declared Types instead of a closed union; the token that can create a Type is not the shared issues token.

Non-goals: deleting, renaming or re-ordering a Type (GitHub documents a delete call; we never use it); issue fields, project fields or labels other than `epic`; a Type on a pull request (Types are issue-only, as `tech-github-area-labels` already says); running anything against the live organization (the maintainer runs `apply issue-types --dry-run`, then the real run).

## What exists today to match

- **`holocron apply properties`** (`commands/repo-properties/run-properties-apply/`) is the precedent for an organization-wide write that is a separate, deliberate step: `Source.getOrgPropertyValues` / `addOrgPropertyValues`, a read-only `doctor repo` row (`repo-capabilities-allowed`) that names the command, `--dry-run` that only reads, an ask first (`--yes` skips it, no terminal throws `NonInteractiveError`), adds only, never removes, keeps the rest of the definition. `setup` does not write the schema.
- **The `org` area** (`.holocron/org.ts`, `OrgConfig`, `placeOrg()`): the one shared area (`SHARED_AREAS`), constants CI does not need, names and identifiers only, a key set both inline and in the file is an error, and a config in a subdirectory reads the root's `org` and may override a key. `placeOrg()` fills provider options and sets `config.domain` when the config leaves it out.
- **`tech-org-secret-visibility`** is the precedent for fail closed on an organization-wide write: no `readers`, no write.
- **`tech-github-area-labels`** decided that on an issue the kind is the Type (Bug, Feature, Task), that kind labels stay on pull requests, that the other kind labels map to Task (Final answers 7), that the backfill's tables are configuration (8), and that `epic` is a synced label with no Type of its own (the stock label table). This spec is the follow-up that gives `epic` a Type.
- **`tech-issue-kind-on-record`** put `kind` on `IssueRecord`; the GitHub import and `sync` write it as the Type, Linear writes the kind label. It names a Type GitHub refuses (401, 403, 404, 422) as a `dropped` line, never a failure. That rule stays.
- **`.notes/tool-work-commands.spec.md`** introduced `--type` on `start work`, deciding the commit type from the kind.
- **The loader hands every plugin `repoValidation.docsCoverage` as an option.** There is a precedent for a config value reaching every plugin without the plugin reading the config.

## Design

### 1. The declaration

**Recommendation: a top-level `issueTypes` list in the `org` area** (`.holocron/org.ts`, `OrgConfig.issueTypes`), placed by `placeOrg()` into `config.issueTypes` when the config leaves it out (the way `domain` is, #1877), the loader handing it to the issues plugins as the option `issueTypes`.

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
  /** The Conventional Commit type `start work` uses for it. Default `chore`. */
  commit?: string;
}
```

All six are declared so the declaration is complete (an existing Type is declared too and is only compared, never rewritten). Proposed content; the three existing rows copy what the organization has today, which this spec could not read (see "Not verified"), so the wording and colour of those three are placeholders until a read of `apply issue-types --dry-run` replaces them:

| Name    | Description                                              | Colour   | `label`       | `commit` |
| ------- | -------------------------------------------------------- | -------- | ------------- | -------- |
| Bug     | An unexpected problem or behavior                        | `red`    | `bug`         | `fix`    |
| Feature | A request, idea, or new functionality                    | `blue`   | `enhancement` | `feat`   |
| Task    | A specific piece of work                                 | `yellow` | `chore`       | `chore`  |
| Spec    | An issue whose work is a design doc                      | `purple` | `spec`        | `docs`   |
| Spike   | Time-boxed research that ends in a finding, not a change | `orange` | `spike`       | `chore`  |
| Epic    | A body of work made of several issues                    | `pink`   | `epic`        | `feat`   |

Why the `org` area:

- Types are organization-wide, not repository-wide, which is what `org` is and what `repo` is not; it is the only shared area, so `apps/sentinel`'s config sees the same list.
- It is names and descriptions, no secret, and CI does not need it, which is the area's rule.
- No new closed-list area name, no `HOLOCRON_AREAS` change, no change to Sentinel's loader (a new area needs none, #1785, but its remote config check must accept the new top-level key; see rollout 1).

Options considered:

| Option                                               | Cost                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`org` area, top-level `issueTypes` (recommended)** | One key on `OrgConfig`, one `placeOrg()` branch, one validation. The area file grows (it is 10 lines today); `.holocron/org.md` says the area holds constants, and six entries with a description each stay readable.                                          |
| A new area `issue-types` (`HOLOCRON_AREAS`)          | A fourth closed area name, a `place()` branch, not shared (a subdirectory config would not inherit it), more files for six rows.                                                                                                                               |
| A GitHub plugin option under `providers.issues`      | Linear and any other tracker cannot read it; a repo with no `issues` entry (GitHub is the default when none is set) has no entry to put it in; the declaration would belong to a vendor, which is what `holocron.config` avoids for anything provider-neutral. |
| Inline in `holocron.config.ts`                       | The file is capped at 200 lines in a test and already pushes bulk to areas; a key set inline and in the file is an error, so no mix.                                                                                                                           |

A name that repeats ignoring case, a `color` that is not one of GitHub's eight words, or a `commit` that is not a Conventional Commit type is a `ConfigError` naming the path, at load.

### 2. The capability, its methods and the verb

**Recommendation: three optional methods on `Issues`, a GitHub implementation, and one writer command `holocron apply issue-types`. `setup` does not write Types.**

```ts
interface IssueTypeInfo { id: number | string; name: string; description?: string; color?: string; enabled: boolean }

// on Issues, all optional
listTypes?(): Promise<IssueTypeInfo[] | undefined>;                       // undefined: cannot be read
createType?(type: OrgIssueType): Promise<IssueTypeInfo>;                  // never replaces
updateType?(id: IssueTypeInfo["id"], patch: { description?: string; color?: string }): Promise<void>; // opt-in only
```

Why on `Issues` and not `Source`: a Type is an issue tracker concept; `Source.getOrgPropertyValues` is a repository-hosting one. A tracker with no Type (Linear) leaves the three methods out, and the CLI says so. The cost is that `Issues` is the capability the shared `github.issues` token resolves for, so the plugin must route these three methods to their own token (section 3); that is a plugin-internal feature word, not a new capability, and the plugin already holds nine tokens. Alternative: put them on `Source` beside the property methods (precedent, resolves to the admin or org token without a new word). It stays in "Open questions" because it is a taste call; the rest of the design does not depend on it.

GitHub's calls, as documented (REST, `Issue types` group): `GET /orgs/{org}/issue-types`, `POST /orgs/{org}/issue-types` (body `name`, `is_enabled` required; `description`, `color` optional; `color` one of `gray`, `blue`, `green`, `yellow`, `orange`, `red`, `pink`, `purple`, or null), `PUT /orgs/{org}/issue-types/{issue_type_id}` (same body). There is also a `DELETE`, which the client group does not wrap at all: a method that is not there cannot be called by mistake, and a test pins its absence. `clients/github-client` gets an `issueTypes` group with `list`, `create` and `update` only (the REST base is bound to `/orgs/...` like the `properties` group).

Rules, all from the issue:

- **Never delete, never rename.** `updateType` sends the Type's current name back (the documented `PUT` body requires `name` and `is_enabled`), so a rename cannot happen; a Type is matched by name case-insensitively and a Type whose name differs only by case is "exists", not a second one.
- **A Type that exists is left alone**, whatever its description, colour or enabled flag. A person's edit in the settings is never overwritten by the default run.
- **Opt-in update:** `apply issue-types --update` also sets `description` and `color` on an existing declared Type whose value differs, and only a field the declaration states. It lists each change first (`was` and `to`), asks first like the create, and never changes `is_enabled` (turning a Type off or on hides it for everyone; an incorrectly declared Type is reported, and a person flips it). Without a stated field there is nothing to update.
- **Idempotent.** A second run changes nothing. A create that answers 409 or 422 for a name that now exists (a race with a person or a second run) is read as exists after one more `list`, as `Source.ensureLabel` style calls elsewhere do; any other 4xx is a failing row.
- **A GitHub list with more than the documented cap is not assumed:** see "Limits".

The verb:

| Option                                     | Cost                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`apply issue-types` only (recommended)** | Matches `apply properties`: an organization-wide write is its own deliberate step with its own token, and `doctor` names it. One more command to remember; `setup` of a new repo does not make Types, which is right, because Types are not per repository.                                      |
| A step in `setup` only                     | `setup` runs per repository, so every repo's run would need the admin-level token and would race the same organization-wide create. It would also spend the single organization admin's token in CI-shaped runs. The properties spec decided the same way ("`setup` does not write the schema"). |
| Both                                       | Two writers of one list, so two code paths to keep in step and two places to explain the token; the failing case (setup runs with a token that cannot write) turns into a skipped row that hides the drift the doctor should show.                                                               |

`apply issue-types` is a `workspace` command (`assertPluginsResolvable`), with entries in `COMMAND_CONTEXTS` and `COMMAND_REGISTRY` and a decision for each option in `command-options.test.ts` (offered or skipped). Options: `--update`, `--yes`, and the global `--dry-run`, `--token`.

### 3. The token and least privilege

GitHub documents the write as needing an administrator of the organization, and for a classic token the `admin:org` scope; list needs `read:org`. The issue states the fine-grained form as organization admin plus **Issue types: write** (and **read** for the read). The shared `HOLOCRON_ISSUES_TOKEN` (`issues: read/write`, `metadata: read`) is what `new issue`, `update issue`, `start work` and `sync issues` use, on a laptop and in CI-adjacent tasks, so it must stay narrow: an organization-wide write on it would let a stolen issues token redefine the vocabulary of every issue.

**Recommendation: a new token `HOLOCRON_ISSUE_TYPES_TOKEN`** (keyring `github.issue-types`, fine-grained, resource owner the organization, Issue types: read and write, nothing else), declared in the GitHub plugin's `tokens` export with `layers: ["local"]` only (a person runs `apply issue-types`; it is never held by `ci`, `dev` or a workflow). Its `expect`: `issue-types` required, and `administration`, `secrets`, `issues` absent (so the probe proves it is narrow). The read half (`doctor`) uses the same token when it is held, else `HOLOCRON_ORG_TOKEN` if it holds Issue types: read, else the row is a skip that names the permission (a 401 or 403 is never a failure).

| Option                                                    | Cost                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New narrow `HOLOCRON_ISSUE_TYPES_TOKEN` (recommended)** | A tenth GitHub token, a row in the table and its own permission table in `tokens.mdx`, one more entry in 1Password's `local` layer and the one admin who holds it. Least privilege: it can do nothing but Types. Rotation follows the 90/14 default. |
| `HOLOCRON_ORG_TOKEN` (already `administration: write`)    | One fewer token, but that token already carries team sync and organization variables; adding Types makes it the bigger single point, and the org token's `expect` would change for every layer it is held in.                                        |
| `HOLOCRON_ADMIN_TOKEN`                                    | It is repo-scoped (`administration`, secrets, environments); an organization permission there widens a token that runs in `ci`. Its `expect` already forbids `org-secrets`, which shows the split is wanted.                                         |

What `docs tokens` and the `github token` probe then need (the three-places rule: table, Environment layer, probe checks):

- `docs/src/content/docs/tokens.mdx`: one row in the "GitHub tokens" table, a `#### HOLOCRON_ISSUE_TYPES_TOKEN` permission table (`Issue types`, id `issue-types`, `required` in `local`, `-` in `dev` and `ci`; `Administration`, `Secrets`, `Issues` `absent`), and the read added to the "Check a GitHub token" table (`issue-types`: `GET /orgs/{org}/issue-types`).
- `plugins/holocron-plugin-github/src/tokens.ts`: the declaration and its `expect` (read through `tokenExpectations()`); `probes/token/permissions.ts`: one read for `issue-types`. A read proves visibility, not write, which the page already says.
- 1Password: the token goes in the `local` layer only; `doctor secrets` treats `local` and `dev` as the machine, so it is not "extra" if declared as a token with `layers: ["local"]`. Nothing for `repo.secrets.sync`.
- The new read in the shared `HOLOCRON_ORG_TOKEN` is **not** added to its `expect` (a required permission there would turn every existing layer red until re-issued); the `doctor` row reads it when held and skips otherwise.

### 4. The `doctor` row

`doctor repo` gains a row `issue-types` (the home of `repo-capabilities-allowed`, an organization comparison that names its fixing command; a `DEEP_CHECKS` entry for a new `doctor issue-types` is not needed, and the issues capability already has a `DEEP_CHECKS` or `NO_DEEP_CHECK` entry). Read only, no write, no new token to run it beyond the read above:

- **A declared Type that the organization lacks: `fail`**, naming it and `holocron apply issue-types`.
- **An undeclared Type the organization has: `info`**, by name (a person's own Type is not wrong).
- **A declared Type with a different description, colour or enabled flag: `info`**, by field (`was`, `declared`), naming `apply issue-types --update` for description and colour. A declared Type that is turned off is an `info` row, never a failure.
- A list that cannot be read, a provider with no `listTypes`, or no declaration: a `skip` with the reason. No declaration is not a failure: a repo that declares nothing is unchanged.
- It prints names, counts and colours only; no token or id.

### 5. Making the kind open

`IssueKind` stops being a closed union and the places that fix it learn the declaration. **Recommendation: keep a small core set of three that the CLI always knows, and add whatever the declaration lists.** The core set is what `start work` and `sync issues` work with when no declaration exists (a repo that declares nothing is unchanged, and the CLI works against a clone where the org file is absent).

- **Type.** `type CoreIssueKind = "bug" | "feature" | "task"` and `type IssueKind = CoreIssueKind | (string & {})` (autocomplete for the core, any other string allowed). A kind is the Type's name in lower case; `Spec` is `spec`. The set of valid kinds for a run is `CORE_KINDS` plus the lower-cased declared names, built by one function `issueKinds(config)` in the CLI (`commands/issue-fields/`, one function per file) that is the only place that list lives.
- **`--type`.** `start work --type`, `new issue --type` and `update issue --type` drop the static `choices` and validate after parse with `issueKinds(config)`, which names the valid words on a miss (the pattern `resolveEnvironmentId()` uses for layer words). Static `choices` would need the config loaded in the yargs builder, which is the wrong place and breaks `--help` in a clone with no config. The cost is that `--help` can no longer list the declared extras: the describe text says "bug, feature, task or a Type the organization declares", and the error lists them. The interactive menu entries (`start-work.entry.ts`, `issue-field-menu-options.ts`) take the core three plus the declared names when the menu can read the config; whether a menu entry can compute its `choices` at run time is Not verified, and the fallback is the core three plus a shipped list of the three new names in the entry. The existing test that expects `--type epic` to be refused changes: `epic` is refused only when it is not declared.
- **Commit type.** `work-title.ts`' `KIND_TYPE` becomes the declared `commit` (default `chore`), with the core three fixed as today. `start work --type spec` titles the pull request `docs(...)`. A declared Type with no `commit` gets `chore`, the same as a Task; an issue with no Type keeps `chore`.
- **GitHub plugin.** `KIND_TYPE_NAMES` and `TYPE_KINDS` are built from the declared names plus the core three (the plugin gets the list as its `issueTypes` option from the loader, the way it gets `docsCoverage`). `writeKind()` sends the declared spelling (`Spec`), not the lower-case kind; the refusal handling is unchanged (a Type the organization lacks is a `dropped` line `kind Spec (…)`, 422 as the spec already assumes). `kindOfIssue()` maps a Type with a name outside the list to its lower-case name instead of `undefined`, so a migration does not lose an Epic.
- **Backfill.** `repo.labels.kinds` and `fallbackKinds` already take any Type name (`resolveKinds()` is a string table) and `unknownTypes()` already reports one the organization lacks, so the backfill needs no code to use a new Type; what it needs is `typeNames()` to stay the one read and `DEFAULT_MAIN_KINDS` to stay the core three (it is a default for repos with no `repo.labels`). This repo's `.holocron/repo.ts` gains `epic: "Epic"` in `kinds` in the same change that retires the label (section 6). `spec` and `spike` have no label today and so no entry.
- **Linear.** Linear has no Type, so a kind is a label. `KIND_LABELS` becomes the core three plus each declared Type's `label` (default the lower-cased name). `labelsFor()` and `kindOfLabels()` read that table, and `provider linear setup` makes each declared label with the colour `colorOf()` takes from `CANONICAL_LABELS` by name, else the declaration's colour word mapped to a hex (a small table, one place). For a Type the plugin has **no label for** (a kind the declaration lacks, or a Linear workspace whose `labels` option omits the declared label): the record's kind is written as a `dropped` line `kind Spike (no label)`, never a failure, and the label is not made behind the user's back by `sync` or `migrate` (only `provider linear setup` makes labels). Reading back, a label that is none of the table's is not a kind. This is the same rule `tech-issue-kind-on-record` set for anything a target cannot carry.

Option for the shape of the open set:

| Option                                            | Cost                                                                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core three plus declared extras (recommended)** | Works with no declaration and in a clone; the type stays autocompleting for the three; two lists to read (`CORE_KINDS` and the declaration), joined in one function.                               |
| Derive everything from the declaration (no core)  | One list, but `start work` and `sync issues` then fail with no `org` area (a repo that has not adopted `.holocron/`, a remote config check in Sentinel), and every test must supply a declaration. |
| `IssueKind = string` with no core                 | Loses the compile-time check that a branch handles every core kind (`work-title`, Linear's `KIND_LABELS`); a typo (`feture`) compiles.                                                             |

### 6. The `epic` label once an Epic Type exists

`epic` is a synced stock label (`CANONICAL_LABELS`: colour `5319e7`, "A body of work made of several issues"; 1 issue, 0 pull requests per `tech-github-area-labels`) and Linear's kind label for an epic once `label` is declared. **Recommendation: keep it until the Type is in use, then retire it by removing it from `CANONICAL_LABELS` and out of `STALE_LABELS`, and never delete it.** The mechanism is the one that spec wrote down for retiring a label: a label removed from the synced list is no longer made or checked by `setup`, and every attachment stays.

"In use" means all three: `apply issue-types` has made Epic (the `issue-types` row is `ok`), `.holocron/repo.ts` maps `epic` to Epic in `repo.labels.kinds`, and the maintainer-run backfill has set Type Epic on the issue that carries `epic` (the probe's dry run lists it first). Until then nothing changes, so no run is red between the steps.

Two cautions: Linear takes a label's colour by name from `CANONICAL_LABELS` (`colorOf()`), so retiring the entry drops Linear's colour for `epic`, which is why the declaration carries the Type's colour and Linear's setup falls back to it; and the labels `epic` already on pull requests or issues are never stripped (the same rule as the kind labels: "left on the issues"). `docs` names the retirement in the stock-label table.

### 7. Dry-run, asking, idempotency, limits

- **`--dry-run`** reads the organization's list, prints each row (`would create Spec`, `exists Bug`, `would update Task description`), and writes nothing: no create, no update, and no token written anywhere. It is the maintainer's first step, with the output attached to the issue before the real run.
- **Asking first.** Without `--yes` it asks once, listing every Type it would create and every field it would update (`confirm`, default no), like `apply properties`; without a terminal it throws `NonInteractiveError` ("changes the organization's issue Types; pass --yes"). `--yes` and `--dry-run` skip the question, as the properties command does. A cancel is a `skip` row and exits 0.
- **Idempotent and stop on error.** A re-run changes nothing. Rows go through `printCheckRows`, one per Type; a failing create is a row and the others go on (the soft-skip pattern); a rate limit stops the run cleanly and says what is left. Declared names are created in the declaration's order so the result is stable.
- **No declaration, no write.** A config with no `issueTypes` makes `apply issue-types` a `skip` row (`no issueTypes declared`), never a write of defaults, and a provider with no `createType` says so.
- **The limit.** GitHub's documentation (managing issue types in an organization) says an organization can have up to 25 issue types, and that the default types are included in addition to the created ones. The REST page states no limit, so the count is from the settings documentation only. `apply issue-types` counts the existing Types plus those it would create before it writes anything; if that is over 25 it stops with a `fail` row naming the count and writes none. Whether the three defaults count toward the 25 is ambiguous in the text (see "Not verified"), so the check counts them, which is the safe side. Six Types is far below either reading.

## Rollout

Each is its own pull request; each includes its tests and docs.

1. **The declaration and the open kind (no write, no GitHub call).** `OrgConfig.issueTypes`, `OrgIssueType`, validation (`ConfigError`s), `placeOrg()`, the loader option, `issueKinds()`, `IssueKind` open, `--type` validated after parse and the menu entries, `work-title` from `commit`, Linear's label table and the GitHub plugin's name table. Sentinel's `resolveConfig()` allows the new key. Docs: `cli/cli/README.md`, `AGENTS.md` (the `org` area bullet and the kind), the config docs page. This repo declares nothing yet, so nothing it generates changes.
2. **The client and the capability.** `clients/github-client` `issueTypes` (list, create, update; no delete, a test pins that), `Issues.listTypes/createType/updateType`, the GitHub implementation with its own token resolution, the token declaration and its `expect`, `docs/src/content/docs/tokens.mdx` and `permissions.ts` (`issue-types` read). The `typeNames()` backfill read may move onto `listTypes()`; separate and optional.
3. **`apply issue-types`.** The command, its tests with hand-written fakes (no live service), `COMMAND_CONTEXTS`, `COMMAND_REGISTRY` and the menu decisions, the docs command page.
4. **The `doctor repo` row** (`issue-types`), its tests, `deep-checks` entries as needed.
5. **This repo declares the six** (`.holocron/org.ts`), `epic: "Epic"` in `.holocron/repo.ts`. **Human steps, in order:** make the token, put it in 1Password's `local` layer, `holocron probe github token --environment local` (proves narrow), `holocron apply issue-types --dry-run`, attach it to the issue, replace the three existing rows' placeholders from that read, `holocron apply issue-types`, then `holocron doctor repo`.
6. **Retire the `epic` label.** After the backfill sets Epic: remove it from `CANONICAL_LABELS`, say so in the stock-label table, keep the label in the repositories.

The pull request carrying 5 is held until the maintainer has the token; 1 to 4 do not need it, and the doctor row is a skip until a declaration exists, so none is red between merges.

## Open questions for the maintainer

1. **Where does the declaration live?** Recommendation: top-level `issueTypes` in the `org` area (`.holocron/org.ts`), placed by `placeOrg()`. Alternatives in section 1.
2. **Which capability carries the methods: `Issues` or `Source`?** Recommendation: `Issues` (`listTypes`, `createType`, `updateType`), with a plugin-internal token for them, so Linear and any future tracker can answer or leave them out. `Source` is the precedent-shaped alternative.
3. **The verb: `apply issue-types` only, a `setup` step, or both?** Recommendation: `apply issue-types` only; `setup` never writes Types, as it never writes the property schema.
4. **The token: a new `HOLOCRON_ISSUE_TYPES_TOKEN`, `local` layer only?** Recommendation: yes, narrow, never held by `ci` or `dev`, with the doctor reading through it when held and skipping otherwise.
5. **May `apply issue-types --update` change a description and colour, and never `enabled`?** Recommendation: yes, opt-in, asked first, only for a field the declaration states.
6. **Does a declared Type that differs in description or colour fail the doctor?** Recommendation: no, `info` only; a missing declared Type is the only failure.
7. **Open `IssueKind` as core three plus declared extras, with `--type` validated after parse?** Recommendation: yes. Cost: `--help` cannot list the extras.
8. **Should the declaration carry `label` (Linear) and `commit` (`start work`)?** Recommendation: yes, both optional with defaults (the lower-cased name; `chore`). The alternative is two more tables in two plugins.
9. **For a Type Linear has no label for, a `dropped` line (recommended) or `provider linear setup` making the label?** Recommendation: `dropped` on `sync` and `migrate`; only `provider linear setup` makes the label.
10. **When is the `epic` label retired?** Recommendation: after Epic exists, `repo.labels.kinds` maps `epic` to Epic and the backfill has typed the one issue; then remove it from `CANONICAL_LABELS`, never delete it.
11. **Colours and descriptions for Spec, Spike and Epic** (purple, orange and pink; the one-line descriptions in section 1), and for the existing three, copied from what the organization shows today.
12. **Keep the 25-Type check and the "count the defaults" reading until GitHub's text is verified?** Recommendation: yes; six is nowhere near it.

## Not verified

- **No call to GitHub was made.** The endpoints, the body fields (`name` and `is_enabled` required, `description` and `color` optional, `color` one of eight words or null) and the `DELETE` are from GitHub's REST documentation, not a call. Whether `PUT` is a full replace (hence the "send the current name and enabled flag back" rule) or accepts a partial body is unknown; the design assumes the documented required fields.
- **The fine-grained permission.** The documentation lists the classic scopes (`read:org` for list, `admin:org` for create, update and delete, plus being an organization administrator). That a fine-grained token has an organization permission named "Issue types" with read and write, and that it satisfies these calls, is taken from the issue and is **not** in the documentation page read. The `tokens.mdx` rows and the `expect` are drafted on that assumption and must be proved with `holocron probe github token --environment local`.
- **The limit.** The documentation says an organization can have up to 25 issue types and that the defaults (Task, Bug, Feature) are "in addition to these"; the REST page states no limit. Whether the 25 includes the three defaults, and the error GitHub returns past it, is not verified.
- **What the three existing Types look like** (their descriptions, colours, whether each is enabled). The table in section 1 uses GitHub's defaults from memory; it is a placeholder until `apply issue-types --dry-run` reads them.
- **Case sensitivity of `type` on an issue update.** `writeKind()` sends the declared spelling; whether GitHub matches a Type name case-insensitively is not verified, which is why the design sends the declared spelling and never the lower-case kind.
- **What a create answers for a name that already exists** (409 or 422), and a rate-limit shape; the design reads either as "exists" after a `list`.
- **Whether `GET /orgs/{org}/issue-types` is readable by the token `HOLOCRON_ORG_TOKEN` already holds**, and whether the GraphQL `organization.issueTypes` read the backfill uses (`first: 50`) matches the REST list (it is a read of the same set).
- **Whether the interactive menu can compute a `choices` list from the loaded config at run time.** The fallback in section 5 does not need it.
- **That Sentinel's `resolveConfig()` and remote check accept an unknown top-level key**, or reject it; rollout 1 adds the key either way.
- **Linear.** Whether Linear accepts `spec` and `spike` as label names and how `epic` interacts with a Linear project or Epic concept is not verified; no Linear call was made.
