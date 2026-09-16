# `@theholocron/github-app`

Holocron's minimal GitHub App — webhook receiver, default-branch-only
`holocron.config.ts` validation, custom-properties sync, one check run per
resolution run.

> Scaffolding only. The webhook receiver, schema validation, and check-run
> posting land in follow-up PRs once the deploy target is decided — see
> `.notes/tech-github-app-v1.spec.md` (repo root) for the full design and
> what's still open.

## Scope (v1)

- Webhook receiver: installation events, push to default branch, PR
  opened/synchronize.
- Read `holocron.config.ts` from a repo's default branch only — never a PR
  branch or fork (hard security boundary, D4/D6 in the epic spec).
- Sync resolved capabilities/profile to GitHub custom properties, extending
  the `syncProperties()` mechanism `@theholocron/holocron-plugin-github`
  already implements.
- Post a single check run reflecting capability-compliance status.

Explicitly out of v1 — tracked in
[#674](https://github.com/theholocron/holocron/issues/674): the App
autonomously triggering autofix PRs or PR comments from a webhook event,
and dashboards.

## Development

| Script                                  | Description                                 |
| --------------------------------------- | ------------------------------------------- |
| `pnpm run delivery.build`               | Bundle with tsdown                          |
| `pnpm run verification.unitTests`       | Run the vitest suite (always with coverage) |
| `pnpm run verification.typeSafety`      | `tsc --noEmit`                              |
| `pnpm run sourceQuality.staticAnalysis` | ESLint                                      |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://theholocron.github.io/holocron/>
