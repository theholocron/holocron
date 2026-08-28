---
status: draft
issue:
blocked-by: []
related:
  - theholocron/holocron/.notes/ai-engineering-workflow.spec.md
  - theholocron/holocron/.notes/knowledge-system.spec.md
---

# Process enforcement — three-layer feedback loop

Defines how process rules get enforced so they are not merely aspirational.
Good process documentation alone does not prevent drift — rules need to be
active at the right moment in the right layer.

---

## The enforcement gap

A common failure mode: a team writes down good rules ("start with a fresh PR",
"add docs", "update the registry") and then those rules get forgotten because
nothing enforces them. The rules exist but the feedback loop does not.

There are three places where enforcement can live, and each covers a different
moment:

| Layer | Mechanism | Moment | Scope |
|---|---|---|---|
| **CI** | Validation scripts | After a PR is opened | Safety net — catches what the other two miss |
| **Skills** | Checklist items in skill files | When Claude is invoked for a specific task | Task-specific guidance at the point of action |
| **CLAUDE.md / AGENTS.md** | Always-on rules | Every task, every session | Cross-cutting rules that apply regardless of what is being built |

The key property of each layer:

- **Skills are invocable** — they run when a developer or agent explicitly asks
  for them. Good for task-specific checklists that only apply in certain contexts.
- **CLAUDE.md is always-on** — the agent reads it at the start of every session.
  Good for rules that apply universally: branch hygiene, docs requirements, PR
  scope.
- **CI catches what both miss** — the last line of defense. If a rule was
  forgotten during task time, the CI job fails and the gap is surfaced before
  merge.

You need all three. Any single layer alone has blind spots.

---

## Layer 1 — CI

CI validation is the safety net. It does not guide the agent during a task; it
catches the outcome if a rule was not followed.

### Registry consistency check

For repos that maintain a package or component registry (e.g., a docs-theme
registry listing all published clients or plugins), a validate script
cross-checks the registry against the actual published packages.

```
CI job: validate-registry
│
├── read registry entries
├── read published packages (package.json names in packages/)
└── diff → fail if a package exists but has no registry entry
```

This runs in:
- The registry repo's own CI (catches direct changes)
- Consuming repos' CI (catches new packages added without a registry update)

### Branch hygiene check

A lightweight check that the PR head is not `main` or `master` catches the
"accidentally worked on main" case before it reaches the review queue.

### Docs presence check

For PRs that add or modify a public export, a check that a corresponding docs
file exists or was updated in the same PR. Exact implementation depends on the
repo's docs structure.

---

## Layer 2 — Skills

Skills guide Claude at the moment a specific task is being performed. The right
place for task-specific checklists.

### Pattern

Every skill that scaffolds or creates something that has downstream obligations
should include a named checklist section:

```markdown
## Checklist

- [ ] Feature branch created before any code was written
- [ ] Package entry added to registry
- [ ] Docs page added or updated
- [ ] Tests written for new behavior
- [ ] PR title follows Conventional Commits
```

The agent works through the checklist before declaring the task done.

### Skills that need enforcement updates

| Skill | Missing checklist items |
|---|---|
| `holocron-plugin` / `plugin create` | Registry update, docs page |
| `holocron-client` (if exists) | Registry update, docs page |
| Any scaffolding skill | Branch verification, docs requirement |

The `/implement` prompt in the AI engineering workflow should also include a
post-implementation checklist covering docs, registry, and branch state. See
`.notes/ai-engineering-workflow.spec.md`.

---

## Layer 3 — CLAUDE.md / AGENTS.md

Always-on rules are the most important layer for cross-cutting hygiene. They
apply to every task in every session regardless of which skill (if any) is
being used.

### Rules to add org-wide (AGENTS.md in theholocron/.github-private)

```markdown
## Before starting any coding task

1. Verify you are on a feature branch, not `main`. If on `main`, create a
   branch first. Never commit directly to `main`.
2. If adding a new exported package or capability, documentation is required
   in the same PR. Do not open a docs-only follow-up PR — docs ship with the
   feature.
3. If adding a new client or plugin package, update the docs-theme registry
   in the same PR or a clearly scoped immediate follow-up.
4. One PR per logical change. Do not bundle unrelated fixes with a feature.

## After completing any coding task

1. Confirm you are still on the intended feature branch.
2. Confirm all checklist items in any invoked skill are complete.
3. Confirm CI is green before requesting review.
```

These rules belong in `AGENTS.md` (the org-level file in
`theholocron/.github-private` that is imported by every repo's `CLAUDE.md`).
Adding them once to `AGENTS.md` propagates to all repos.

---

## Feedback loop summary

```
Developer / Agent starts a task
            │
            ▼
     CLAUDE.md rules fire
     (always-on: branch, docs, scope)
            │
            ▼
     Skill invoked (if applicable)
     (task-specific checklist)
            │
            ▼
     PR opened
            │
            ▼
     CI validation
     (registry diff, docs check, branch check)
            │
         pass │ fail
              │
           merge    ← surfaced gap, task resumes from skill/CLAUDE.md layer
```

Each layer catches a different class of miss. A miss that gets through CLAUDE.md
and the skill checklist hits CI. A miss that gets through CI is a gap in the CI
validation that should be closed.

---

## Implementation

### theholocron/.github-private — AGENTS.md

Add the "Before starting" and "After completing" rule blocks to `AGENTS.md`.
They propagate to every repo that imports it via `@../github-private/AGENTS.md`.

### theholocron/skills — skill checklist updates

Update each scaffolding skill (plugin, client, any create/scaffold command) to
include an explicit checklist section covering branch state, registry, and docs.

Update the `/implement` workflow prompt to include a post-implementation
checklist.

### theholocron/holocron — CI validation

Add a `validate-registry` job to the CI workflow for repos that maintain a
registry. The job reads the registry and the packages directory and diffs them.

Add a docs-presence check for PRs that touch `src/` or `packages/` without a
corresponding change in `docs/`.

---

## Open questions

1. **Registry format** — the validate script needs a stable interface. If the
   registry is a hand-maintained JSON file, diffing is straightforward. If it is
   derived from package metadata, the script needs to know the derivation. Settle
   this before implementing the CI job.
2. **Docs-presence check scope** — not every file change in `src/` needs a docs
   update (internal refactors, test changes). The check should only fire for
   changes to public exports or new top-level packages. Define the heuristic
   (e.g., new `packages/*/src/index.ts` without a matching `docs/` change).
3. **AGENTS.md update cadence** — AGENTS.md is checked into `.github-private`
   and imported at conversation start. Changes take effect immediately for new
   sessions. Existing long-running sessions do not pick up the update. Acceptable
   given the session model.
