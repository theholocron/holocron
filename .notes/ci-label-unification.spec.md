---
status: archived # draft → proposed (issue filed) → approved (milestone attached) → archived (shipped)
---

<!-- Implementation: holocron#138 (label sync), holocron#139 (bookkeeping-pr permissions fix) -->
<!-- Docs: .github#40 (public label table), .github-private runbook updated, 2026-07-15 -->
<!-- Follow-up: org custom properties — .notes/org-custom-properties.spec.md (not yet written) -->

# Spec: Unified org-wide label management

## Problem

Labels are inconsistent across the five active repos. Key pain points:

- `labeler.yml` maps `'^ci'` → `github_actions`, but `github_actions` doesn't
  exist in `configs` or `holocron` — any `ci:` PR in those repos silently
  fails to label.
- `performance` and `refactor` have different hex colors between `.github` and
  `configs`.
- Stale/repo-specific labels (`javascript`, `autorelease: pending`,
  `autorelease: tagged`, `released on @alpha`, `triage`) are present in some
  repos but not others.
- Org repository defaults haven't been set, so new repos start with GitHub's
  default label set instead of the org's.

## Current state (as of 2026-07-15)

| Label                  | `.github`  | `.github-private` | `configs`  | `holocron` | `clients` |
| ---------------------- | :--------: | :---------------: | :--------: | :--------: | :-------: |
| `bug`                  |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `dependencies`         |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `documentation`        |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `duplicate`            |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `enhancement`          |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `good first issue`     |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `help wanted`          |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `invalid`              |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `question`             |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `wontfix`              |     ✓      |         ✓         |     ✓      |     ✓      |     ✓     |
| `chore`                |     ✓      |         —         |     ✓      |     —      |     —     |
| `ci`                   |     ✓      |         —         |     ✓      |     —      |     —     |
| `github_actions`       |     ✓      |         ✓         |     —      |     —      |     ✓     |
| `refactor`             | ✓ (e4e669) |         —         | ✓ (cfd3d7) |     —      |     —     |
| `test`                 |     ✓      |         —         |     ✓      |     —      |     —     |
| `performance`          | ✓ (fbca04) |         —         | ✓ (c5def5) |     —      |     —     |
| `triage`               |     —      |         —         |     —      |     ✓      |     ✓     |
| `released`             |     —      |         —         |     ✓      |     ✓      |     ✓     |
| `autorelease: pending` |     —      |         —         |     ✓      |     ✓      |     —     |
| `autorelease: tagged`  |     —      |         —         |     —      |     ✓      |     —     |
| `released on @alpha`   |     —      |         —         |     —      |     ✓      |     —     |
| `javascript`           |     —      |         —         |     ✓      |     ✓      |     ✓     |
| `status:in-progress`   |     —      |         —         |     —      |     —      |     —     |
| `status:in-review`     |     —      |         —         |     —      |     —      |     —     |

Note: `status:in-progress` and `status:in-review` are referenced in
`configs/holocron.config.ts` issues config but don't exist in any repo.

## Canonical label set

All repos should have exactly these labels. Colors are hex without `#`.

| Label              | Color    | Description                        | Maps from                   |
| ------------------ | -------- | ---------------------------------- | --------------------------- |
| `bug`              | `d73a4a` | Something isn't working            | `fix:`                      |
| `chore`            | `ededed` | Maintenance, no user-facing change | `chore:`                    |
| `ci`               | `0075ca` | CI/CD pipeline changes             | `ci:`                       |
| `dependencies`     | `0366d6` | Dependency update                  | `chore(deps):` / dependabot |
| `documentation`    | `0075ca` | Documentation only                 | `docs:`                     |
| `duplicate`        | `cfd3d7` | Already reported                   | —                           |
| `enhancement`      | `a2eeef` | New feature or request             | `feat:`                     |
| `good first issue` | `7057ff` | Good for newcomers                 | —                           |
| `help wanted`      | `008672` | Extra attention needed             | —                           |
| `invalid`          | `e4e669` | Doesn't seem right                 | —                           |
| `performance`      | `fbca04` | Performance improvement            | `perf:`                     |
| `question`         | `d876e3` | Further information requested      | —                           |
| `refactor`         | `cfd3d7` | Code restructuring                 | `refactor:`                 |
| `released`         | `ededed` | Included in a release              | — (semantic-release)        |
| `test`             | `bfd4f2` | Test-related changes               | `test:`                     |
| `triage`           | `e4e669` | Needs investigation                | —                           |
| `wontfix`          | `ffffff` | Won't be addressed                 | —                           |

### Labels to DELETE from every repo

- `github_actions` — replaced by `ci`
- `javascript` — language tag, too granular
- `autorelease: pending` — semantic-release internal, not useful for humans
- `autorelease: tagged` — same
- `released on @alpha` — too implementation-specific
- `status:in-progress` — not yet created anywhere; skip for now
- `status:in-review` — same

Note: `released` is kept because it's visible/useful in issue trackers.

### labeler.yml change required

The `labeler.yml` template in `packages/cli/src/commands/setup.ts` and the
generated `labeler.yml` files in all repos need `github_actions` → `ci`:

```yaml
# Before
github_actions:
    - "^ci"

# After
ci:
    - "^ci"
```

Also add the missing conventional commit types:

```yaml
bug:
    - "^fix"
chore:
    - '^chore(?!\(deps)' # chore: but not chore(deps:)
ci:
    - "^ci"
dependencies:
    - '^chore\(deps'
documentation:
    - "^docs"
enhancement:
    - "^feat"
performance:
    - "^perf"
refactor:
    - "^refactor"
test:
    - "^test"
```

## Automation approach

### Where it lives

Implement as a new `labels` capability in `holocron-plugin-github`
(`packages/holocron-plugin-github/src/capabilities/labels.ts`).

Wire it into `holocron setup` alongside the existing repo-policy and
workflow-setup steps so that `holocron setup` idempotently ensures labels match
the canonical set.

### Config schema

Add an optional `labels` key to `holocron.config.ts` (via the plugin's schema).
Repos that don't set it get the full canonical set. Repos can opt out of
specific labels or add extras:

```typescript
// Default — gets full canonical set automatically
// (no labels key needed in most repos)

// Override example (if a repo wants extras):
labels: {
  extra: [{ name: "needs-design", color: "f9d0c4" }],
  exclude: ["triage"],
}
```

### Implementation steps

**Step 1 — Define `CANONICAL_LABELS` constant in the CLI**

In `packages/cli/src/commands/setup.ts` (near `ALEX_CONFIG`):

```typescript
export const CANONICAL_LABELS = [
	{ name: "bug", color: "d73a4a", description: "Something isn't working" },
	{ name: "chore", color: "ededed", description: "Maintenance, no user-facing change" },
	{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
	{ name: "dependencies", color: "0366d6", description: "Dependency update" },
	{ name: "documentation", color: "0075ca", description: "Documentation only" },
	{ name: "duplicate", color: "cfd3d7", description: "Already reported" },
	{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
	{ name: "good first issue", color: "7057ff", description: "Good for newcomers" },
	{ name: "help wanted", color: "008672", description: "Extra attention needed" },
	{ name: "invalid", color: "e4e669", description: "Doesn't seem right" },
	{ name: "performance", color: "fbca04", description: "Performance improvement" },
	{ name: "question", color: "d876e3", description: "Further information requested" },
	{ name: "refactor", color: "cfd3d7", description: "Code restructuring" },
	{ name: "released", color: "ededed", description: "Included in a release" },
	{ name: "test", color: "bfd4f2", description: "Test-related changes" },
	{ name: "triage", color: "e4e669", description: "Needs investigation" },
	{ name: "wontfix", color: "ffffff", description: "Won't be addressed" },
] as const;

export const STALE_LABELS = [
	"github_actions",
	"javascript",
	"autorelease: pending",
	"autorelease: tagged",
	"released on @alpha",
];
```

**Step 2 — Add `syncLabels` function to `holocron-plugin-github`**

Fetches current labels, diffs against canonical set, then:

- `POST /repos/{owner}/{repo}/labels` — create missing
- `PATCH /repos/{owner}/{repo}/labels/{name}` — fix color/description mismatches
- `DELETE /repos/{owner}/{repo}/labels/{name}` — remove stale labels

```typescript
export async function syncLabels(
	github: GitHubClient,
	repo: string,
	canonical: typeof CANONICAL_LABELS,
	stale: string[]
): Promise<void>;
```

**Step 3 — Call `syncLabels` inside `runSetup`**

Add after the existing repoPolicy step in
`packages/cli/src/commands/setup.ts`:

```typescript
await runStep("Sync labels", () => syncLabels(github, config.project.repo, CANONICAL_LABELS, STALE_LABELS));
```

**Step 4 — Update `labeler.yml` template in `setup.ts`**

Replace the generated `labeler.yml` content (in `generateLabelerYml` or
equivalent) with the full conventional-commit mapping from the "labeler.yml
change required" section above.

**Step 5 — One-time migration**

After the code lands on `alpha`, run:

```sh
GITHUB_TOKEN=$(gh auth token) pnpm exec holocron setup
```

in each of the five repos. This is idempotent — safe to re-run.

Also manually trigger `sync-workflow-templates` dispatch to push the updated
`labeler.yml` to all repos.

**Step 6 — Org defaults**

Go to https://github.com/organizations/theholocron/settings/repository-defaults
and delete the GitHub default labels (bug, documentation, etc.) then add the
canonical set. This ensures new repos start clean.

GitHub does NOT provide an API for org-level default labels — this step must
be done manually in the UI.

## Files to change

| File                                                         | Change                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `packages/cli/src/commands/setup.ts`                         | Add `CANONICAL_LABELS`, `STALE_LABELS` constants; call `syncLabels` in `runSetup` |
| `packages/cli/src/commands/setup.ts`                         | Update `generateLabelerYml` to use full conventional-commit mapping               |
| `packages/holocron-plugin-github/src/capabilities/labels.ts` | New file — `syncLabels` implementation                                            |
| `packages/holocron-plugin-github/src/index.ts`               | Export `labels` capability                                                        |
| Tests                                                        | Unit tests for `syncLabels` covering create/update/delete paths                   |

## Open questions

- Should `syncLabels` hard-delete stale labels or just warn? (Deleting removes
  the label from all issues/PRs silently — a warning-then-confirm flow may be
  safer for the first run.)
- Should repos be able to ADD extra labels via config, or is the canonical set
  truly fixed?
- `released` is managed by semantic-release — should `syncLabels` skip it if
  semantic-release already handles it?
