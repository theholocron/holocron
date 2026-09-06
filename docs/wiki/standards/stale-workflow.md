# Stale workflow

The reusable `stale.yml` workflow runs daily and marks issues and pull requests
inactive after a configurable period, then closes them if they remain untouched.

By default it protects anything actively in use: milestoned issues and PRs,
project-assigned issues and PRs, and issues labelled `in-progress` or `wip` are
never marked stale regardless of age.

## Configuring per repo

Pass `with:` overrides via the `workflows` array in `holocron.config.ts`:

```ts
workflows: [
  {
    name: "stale",
    with: {
      "days-before-stale": 60,
      "days-before-close": 14,
      "exempt-issue-labels": "in-progress,wip,blocked",
    },
  },
],
```

## All inputs

### Thresholds

| Input                     | Default | Description                                                                                                                         |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `days-before-stale`       | `30`    | Days of inactivity before an issue **or** PR is marked stale. Acts as the fallback for both unless a type-specific value is set.    |
| `days-before-close`       | `5`     | Days after the stale label is applied before the item is closed. Acts as the fallback for both unless a type-specific value is set. |
| `days-before-issue-stale` | `-1`    | Issue-specific stale threshold. `-1` inherits from `days-before-stale`.                                                             |
| `days-before-issue-close` | `-1`    | Issue-specific close threshold. `-1` inherits from `days-before-close`.                                                             |
| `days-before-pr-stale`    | `-1`    | PR-specific stale threshold. `-1` inherits from `days-before-stale`.                                                                |
| `days-before-pr-close`    | `-1`    | PR-specific close threshold. `-1` inherits from `days-before-close`.                                                                |

**Example — issues go stale slower than PRs:**

```ts
with: {
  "days-before-stale": 30,        // PR default
  "days-before-issue-stale": 90,  // issues get more time
  "days-before-close": 7,
}
```

### Issue exemptions

| Input                         | Default             | Description                                                                         |
| ----------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `exempt-issue-labels`         | `"in-progress,wip"` | Comma-separated labels. Issues carrying any of these labels are never marked stale. |
| `exempt-all-issue-milestones` | `true`              | Issues assigned to any milestone are never marked stale.                            |
| `exempt-all-issue-projects`   | `true`              | Issues assigned to any project board are never marked stale.                        |

### PR exemptions

| Input                      | Default | Description                                                                                                                                   |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `exempt-pr-labels`         | `""`    | Comma-separated labels. PRs carrying any of these labels are never marked stale. Empty by default — add labels like `do-not-close` if needed. |
| `exempt-all-pr-milestones` | `true`  | PRs assigned to any milestone are never marked stale.                                                                                         |
| `exempt-all-pr-projects`   | `true`  | PRs assigned to any project board are never marked stale.                                                                                     |

## What is not configurable

| Value                                  | Why                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Cron schedule (`30 1 * * *`)           | Daily frequency is appropriate for all repos.                           |
| `stale-issue-label` / `stale-pr-label` | Hardcoded to `wontfix` — org convention.                                |
| Stale and close messages               | Templated from the threshold inputs; consistent wording across the org. |
| `runs-on` / `timeout-minutes`          | Org-wide defaults; not worth per-repo variance.                         |
