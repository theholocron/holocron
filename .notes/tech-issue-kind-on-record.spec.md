---
status: draft
issue: theholocron/holocron#2485
blocked-by: []
related:
  - theholocron/holocron#2430
  - theholocron/holocron#2429
---

# Issue kind on `IssueRecord`

## Problem

An issue's kind (bug, feature, task) lives in a Type on GitHub and has no home on Linear, where it is a label. `IssueRecord` carries `labels` and nothing else, so `holocron migrate` and `holocron sync issues` lose the kind of a GitHub issue that has a Type and no kind label, and never write a Type on a GitHub target. `tech-github-area-labels` (open question 4) recommended this follow-up once issues rely on Type.

## Design

- `IssueRecord.kind?: IssueKind` (`bug`, `feature`, `task`, the type `Issues.create` and `Issues.update` already take). A record without it behaves exactly as before.
- **GitHub export** fills it from the issue Type (`Bug`, `Feature`, `Task`), else from the kind labels (`bug`, `enhancement`, `chore`) when exactly one kind is named; two different kind labels give no kind. Labels are exported unchanged.
- **GitHub import and sync** write it as the issue Type with the issues API (the call `update issue` uses). The kind label is not added. A refusal (401, 403, 404, 422: no such Type) is a `dropped` line, never a failure. On sync, an issue whose Type already matches is left alone, a different one is `changes: kind`, and nothing is written on `--dry-run`.
- **Linear export** fills it from the kind label with the same rule. **Linear import and sync** write it as that label (`bug`, `enhancement`, `chore`, the `KIND_LABELS` the create path uses), creating it when the team lacks it, and only when the record's labels do not already name it.
- Nothing the target cannot carry is silent: a Type GitHub refuses is a `dropped` row; Linear can always carry it.

## Not verified

No live GitHub or Linear call: writing Type is the API write `update issue` already uses, itself unverified.
