---
status: proposed
issues:
  - theholocron/holocron#453
blocked-by: []
---

# Workflow config audit — what moves into `holocron.config`

Audit of every generated workflow template for hardcoded values that should
instead be driven by `holocron.config`. The goal is to identify real gaps,
not to over-engineer: only values that differ per repo or that users regularly
need to change belong in config.

---

## How the system works today

Each repo carries a set of thin-caller `.github/workflows/*.yml` files.
Those are generated artifacts — `holocron sync-github` stamps them from
thin-caller templates in `packages/cli/src/commands/setup-workflows/workflows/`.
Each thin caller delegates to a reusable workflow in `theholocron/.github`
(itself generated from `packages/cli/src/templates/workflows/`).

Per-repo customisation already has a first-class mechanism: the `workflows`
array in `holocron.config.ts` accepts `with:` overrides that are merged into
the generated thin caller by `generateThinCallerContent()`:

```ts
workflows: [
  "lint",
  { name: "test",    with: { "run-unit": true } },
  { name: "release", with: { "run-build": true } },
]
```

---

## Audit findings

### Already handled — no changes needed

| Value | Mechanism |
|---|---|
| Node.js version | `setup-node.yml` reads `.node-version` first; falls back to `"22.x"`. `holocron upgrade node` keeps `.node-version` in sync. |
| Wiki params (`fern-org`, `base-path`, `preview-id`) | Generated from `providers.wiki` options in the `sync-wiki` step. |
| Cloudflare Pages project name | Derived from `org` context via `extractPreviewConfig`; falls back to the `CLOUDFLARE_PAGES_PROJECT` org variable. |
| Deploy paths (`docs/**`, `astro.config.ts`, …) | Derived from `with: { docs: true }` shorthand via `deriveDeployPaths()`. |
| Storybook deploy config | `with: { storybook: [...] }` shorthand via `normalizeWorkflowWith()`. |
| Test flags (`run-unit`, `run-interaction`, etc.) | Passed as `with:` overrides through the `workflows` array. |
| Chromatic config | `run-chromatic` shorthand expands to `chromatic-projects` JSON. |
| Stale cron schedule (`"30 1 * * *"`) | Daily frequency is fine for all repos — this is not worth making configurable. |

### Should remain hardcoded — org-wide constants

| Value | Why hardcoded is fine |
|---|---|
| `runs-on: ubuntu-latest` | Org standard; no repo needs a different runner today. |
| `timeout-minutes` per job | Reasonable org-wide defaults. Repos that hit these should fix the root cause. |
| `branches: [main, alpha]` on push triggers | Org convention. All repos use the same release branch model. |
| Permissions blocks | Minimal by design; consistency matters more than per-repo variance. |
| Action SHA pins (`codecov/codecov-action@...`, etc.) | Updated centrally via Dependabot — that is the right mechanism. |

### Real gaps — changes needed

#### Gap 1 — Stale label exemptions missing from reusable

**Current state:** The reusable `stale.yml` (in `theholocron/.github`) uses
`actions/stale` with `exempt-all-pr-milestones: true` — milestoned PRs are
never marked stale. But there is no equivalent exemption for issues:

- Issues with an "in progress" label are marked stale after 30 days just like idle ones.
- There is no `exempt-issue-labels` input on the reusable, so consuming repos
  cannot exempt active work labels (`in-progress`, `wip`, etc.) through `with:`.
- There is no `exempt-all-issue-milestones` input, so milestoned issues are not
  protected the way milestoned PRs are.

**Impact:** The current 30-day default marks in-progress issues stale, forcing
maintainers to reopen them repeatedly.

**Proposed fix:** Add to the reusable `stale.yml` template
(`packages/cli/src/templates/workflows/stale.yml`):

```yaml
workflow_call:
  inputs:
    exempt-issue-labels:
      description: >
        Comma-separated list of labels that exempt an issue from being marked stale.
      type: string
      required: false
      default: "in-progress,wip"
    exempt-all-issue-milestones:
      description: Issues assigned to any milestone are never marked stale.
      type: boolean
      required: false
      default: true
```

Wire both into the `actions/stale` step alongside the existing inputs.

Consuming repos that want non-default behaviour can pass `with:` overrides via
`holocron.config`:

```ts
workflows: [
  { name: "stale", with: { "exempt-issue-labels": "in-progress,wip,blocked" } },
]
```

---

#### Gap 2 — Stale thresholds cannot be passed from `holocron.config`

**Current state:** The reusable already accepts `days-before-stale` (default
30) and `days-before-close` (default 5) as `workflow_call` inputs. But the
thin-caller template for stale passes no `with:` block:

```yaml
jobs:
  stale:
    uses: theholocron/.github/.github/workflows/stale.yml@main
    secrets: inherit     # ← no with: block
```

`generateThinCallerContent()` can only inject `with:` overrides if there is
either an existing `with:` block to merge into, or a trailing `secrets: inherit`
to inject before. The injection path works correctly — the problem is that no
code today passes `with:` overrides when writing the stale thin caller.

**Impact:** `{ name: "stale", with: { "days-before-stale": 60 } }` in
`holocron.config` is silently ignored.

**Proposed fix (depends on Gap 1):** No code change needed beyond Gap 1.
Once Gap 1 adds `exempt-issue-labels` and `exempt-all-issue-milestones` to
the reusable, the thin caller template needs a `with:` block with sensible
defaults to make the `generateThinCallerContent()` merge path work:

```yaml
jobs:
  stale:
    uses: theholocron/.github/.github/workflows/stale.yml@main
    with:
      exempt-issue-labels: "in-progress,wip"
      exempt-all-issue-milestones: true
    secrets: inherit
```

With this in place, any per-repo `with:` overrides flow through naturally.

---

#### Gap 3 — `enable-auto-commit` hardcoded in lint thin-caller template ✅ fixed

**Previous state:** The lint thin-caller template
(`setup-workflows/workflows/lint.yml`) hardcoded:

```yaml
jobs:
  lint:
    …
    with:
      enable-auto-commit: true
```

Repos could not opt out through `holocron.config` — the value was baked into
the generated file and overwritten on every sync.

**Fix applied:** Removed the hardcoded `with:` block from the template. The
generation code now injects `enable-auto-commit: true` as a default `withOverride`
when processing the `lint` workflow, before any user-supplied overrides are
merged. Repos that need to disable auto-commit can now do so explicitly:

```ts
workflows: [
  { name: "lint", with: { "enable-auto-commit": false } },
]
```

All repos that don't specify a value continue to get `enable-auto-commit: true`.

---

## Summary

| # | Gap | Status | Effort |
|---|---|---|---|
| 1 | Add `exempt-issue-labels` + `exempt-all-issue-milestones` to stale reusable | Todo | S |
| 2 | Propagate stale `with:` defaults in thin-caller template | Blocked by Gap 1 | XS |
| 3 | `enable-auto-commit` in lint — remove from template, inject as default | **Done** | XS |

Gaps 1 + 2 ship together as a follow-up; the reusable change goes to
`theholocron/.github` via `sync-github`, and the thin-caller template update
ships in the same PR.

---

## Out of scope

- **`engines.node` → workflow node version:** `.node-version` already handles this correctly.
- **Per-repo `timeout-minutes`:** Solve slow jobs at the source, not with config.
- **Concurrency group patterns:** Consistently templated; no real variance needed.
- **Branch trigger names:** Org-wide convention.
