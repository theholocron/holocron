---
id: SPEC-0089
status: archived
issue: theholocron/holocron#2253
blocked-by: []
related:
  - theholocron/holocron#1859
  - theholocron/holocron#2251
discussion:
  url: https://discord.com/channels/1303969001822486568/1571951020005662761
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

- **Write.** `POST /repos/{owner}/{repo}/issues/{number}/issue-field-values` with
  `{ "issue_field_values": [{ "field_id": <id>, "value": "<Option name>" }] }` adds a value and leaves the issue's other
  field values alone. `PUT` on the same path replaces every field value of the issue, and a multi-select value read back
  cannot be sent again with certainty (the docs list no multi-select for `PUT`), so it is not used. A value that differs is
  first removed with `DELETE .../issue-field-values/{field_id}`; the provider reads the issue's values
  (`GET .../issue-field-values`) to know which. (If the `POST` then fails, the issue is left with no value until the next
  run sets it.)
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

- `@theholocron/github-client`: `issueFields.list(org)`, `issueFields.values(repo, number)`,
  `issueFields.addValues(repo, number, values)` and `issueFields.deleteValue(repo, number, fieldId)`, one call each, no
  behaviour of their own.
- GitHub plugin: `createPrioritySetter(client, repo)` in `issue-priority.ts` (the field list read once per run), used by
  the create and update paths of `syncIssues()` and by `importIssues()`; the reason a value was not set goes in `dropped`.
- No change to the neutral capability types, the CLI, the config or the org's `holocron_capabilities`.

## Authorization

The docs name no fine-grained token permission for the endpoint, only that the caller needs push access to the repository,
and say nothing about the organization's field list. The first real write settles what `HOLOCRON_ISSUES_TOKEN` needs. When it
is refused the run still passes, with the reason in the report, and `tokens.mdx` and the token's `expect` table get the
permission added (the three places together: the table, the layer that holds the token, the probe).

## Testing

Each client function against `stubFetch`; `createPrioritySetter()` for set, same value (no call), changed value, other values
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
