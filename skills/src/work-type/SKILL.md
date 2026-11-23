---
name: work-type
title: Work Type
description: How to choose --type (Epic, Spike, Bug, Feature or Task) for holocron new work, new issue and start work. INVOKE WHEN: filing an issue or starting work with holocron new work, new issue or start work, or when asked what kind of issue something is. Invoked as /work-type.
---

# Work type

An issue has one organization `Type`: the three defaults **Bug**, **Feature** and **Task**, plus **Epic** and
**Spike** where the organization declares them (`issueTypes`, spec `tech-org-issue-types`). The CLI infers a
Type in a few places (the backfill, `new issue`, `start work` with no `--type`), and an agent files issues by
hand. This skill gives both the same rules, so they agree. It sits beside `work-effort`, which does the same
for `--effort`.

## When to use

- You are about to run `holocron new work`, `holocron new issue` or `holocron start work`.
- You are asked what kind of issue something is.
- An issue has the wrong Type and you are about to change it with `holocron update issue --type`.

## The rules

| Type        | When                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Epic**    | The title starts `epic(...)` (this repo's convention, for example `epic(comlink)`), **or** the issue has sub-issues or relations (a parent of others, or tracked by blocked-by links). |
| **Spike**   | **Never inferred.** Set by hand, or when you are asked to do a research task whose result is a finding rather than a change.                                                           |
| **Bug**     | Something that worked, or was meant to work, is broken (the `bug` label, a `fix` title).                                                                                               |
| **Feature** | New or changed behaviour a user sees (the `enhancement` label, a `feat` title). **A feature that has a spec stays Feature.**                                                           |
| **Task**    | Everything else (the `chore` label and the other kind labels). **A spec-only issue is a Task.**                                                                                        |

There is **no Spec Type**: a spec is a document inside an issue's lifecycle, not a kind of issue.

## Precedence

When more than one rule applies:

1. **A Type already set always wins.** Never overwrite it, whether a person chose it or an earlier run did.
2. An **Epic signal** (an `epic(...)` title, sub-issues or relations) beats a label.
3. A **label** beats a title.
4. Two kind labels on one issue: leave the Type unset and ask, as the backfill does.

## Writing it

- Pass `--type <kind>` when the issue is made: `holocron new work "<title>" --type <kind>` or
  `holocron new issue "<title>" --type <kind>`. `start work` takes `--type` too.
- **State the reason in one line**, with the command or in your reply, for example:
  `Type Task: a spec-only issue is a Task, not a Feature.`
- Change it later with `holocron update issue <key> --type <kind>` when it was mis-typed, and say why.
- A tracker with no Types reports the value as `not carried across` or maps it to a label. That is not a failure.

## When to ask the maintainer

- The ask is one line and could be a bug or a feature ("make the doctor faster").
- You think it is a Spike but nobody said so: ask, never assume.
- Two kind labels disagree.

## Non-negotiables

- **Never infer Spike.** Only a person, or a research ask whose result is a finding, makes one.
- Never overwrite a Type that is already set.
- Only the declared names: `bug`, `feature`, `task`, `epic`, `spike`. Never invent one, and never a Spec Type.
- Always give the one-line reason.

## Checklist

1. Is a Type already set, or named in the ask? Use it.
2. Otherwise check for an Epic signal: an `epic(...)` title, sub-issues or relations.
3. Then the kind label, then the title's conventional-commit type.
4. A feature with a spec stays Feature; a spec-only issue is a Task.
5. Spike only on a person's say-so or a research ask. Otherwise never.
6. Pass `--type <kind>` and state the reason in one line.
