---
status: draft
issue: theholocron/holocron#2253
blocked-by: []
related:
  - theholocron/holocron#1859
  - theholocron/holocron#2251
---

# Write GitHub's issue Priority field from sync and migrate

## Problem

GitHub keeps priority in three places:

1. **The `priority: <level>` label.** What `sync issues` and `migrate` write today (`labelsFor()` in the GitHub plugin).
2. **The board's own `Priority` field.** A project field, per board (v5 has `1 · Now`, `2 · Next`, `3 · Process`). `migrate project`
   fills it through `Projects.addItems`, and none of the levels match its options, so every priority is dropped.
3. **The organization's issue field `Priority`.** It belongs to the issue, in every repo of the org, and its options are
   `Urgent`, `High`, `Medium`, `Low`: the neutral levels (`IssuePriority`) exactly. Nothing writes it, and no issue sampled
   (the five most recently updated open ones) has a value.

A priority copied from Linear therefore lands only as a label.

## Decision

The GitHub provider sets the issue field from the record's priority, in every repo, with or without a board. The label
stays for now, and the board's own `Priority` field is left alone (a board may keep its own meaning for it).

- **Write.** `PUT /repos/{owner}/{repo}/issues/{number}/issue-field-values` with
  `{ "issue_field_values": [{ "field_id": <id>, "value": "<Option name>" }] }`. `PUT` replaces every field value of the
  issue, so the call sends the issue's other values back unchanged: the provider first reads them with
  `GET .../issue-field-values` and sends the Priority one changed. (`POST` adds a value without replacing, but it is not
  documented to change one already set, so it is not used.)
- **The field id** comes from `GET /orgs/{org}/issue-fields`, found by name (`Priority`), once per run. The option is
  found by name, case-insensitively, from the neutral level: `urgent` to `Urgent`, `high`, `medium`, `low`. No mapping table
  is needed because the names are the levels.
- **When it applies.** On create (after the issue exists), and on an update when the issue's value differs from the
  record's. A record with no priority (`none`) never clears a value. An issue a person changed to another level by hand is
  set back by the next sync, as the label is: the source is the truth.
- **Where it does not apply, it says so, never fails the run.** An organization without the field, a repository whose owner is
  a user, a level the field has no option for, or a refusal from GitHub (403, 404, 422) is reported in `dropped` as
  `priority field (<reason>)` and counted under "not carried across", as an unmapped assignee is. The label is still set.
- **Dry run.** Reads, writes nothing, and lists the change as `priority field` in `changes`.

## Interfaces

- `@theholocron/github-client`: `issueFields.list(org)`, `issueFieldValues.list(repo, number)` and
  `issueFieldValues.set(repo, number, values)`, one function each, no behaviour of their own.
- GitHub plugin: `setIssuePriority(client, repo, number, level)` in one file, used by `createFromRecord()` and the update
  path of `syncIssues()`; `droppedFor()` gains the reason it was not set.
- No change to the neutral capability types, the CLI, the config or the org's `holocron_capabilities`.

## Authorization

The docs name no fine-grained token permission for the endpoint, only that the caller needs push access to the repository,
and say nothing about the organization's field list. The first real write settles what `HOLOCRON_ISSUES_TOKEN` needs. When it
is refused the run still passes, with the reason in the report, and `tokens.mdx` and the token's `expect` table get the
permission added (the three places together: the table, the layer that holds the token, the probe).

## Testing

Each client function against `stubFetch`; `setIssuePriority()` for set, same value (no call), changed value, other values
kept, no field, no option, a 403 and a user-owned repository; the create and update paths of `syncIssues()` and `import`;
`droppedFor()`.

## Out of scope

- The board's `Priority` field and the `roadmap` template's options. A board may keep its own meaning for priority.
- Dropping the label. Revisit once the field is in use and a reader of it exists.
- The Effort field and the Start and Target dates.

## Acceptance criteria

- `sync issues --from linear:team=ENG --to github` leaves an issue with the `Priority` field set to the level the Linear
  issue has, and a second run changes nothing.
- A repo in an organization with no issue fields still syncs, with `priority field` under "not carried across".
