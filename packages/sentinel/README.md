# `@theholocron/sentinel`

Holocron's minimal GitHub App — webhook receiver, default-branch-only
`holocron.config.ts` validation, custom-properties sync, one check run per
resolution run.

> A sentinel droid: it watches, validates, and reports — never acts on its
> own. The custom-properties sync call and check-run posting land in
> follow-up PRs once the deploy target is decided — see
> `.notes/tech-sentinel-v1.spec.md` (repo root) for the full design and
> what's still open.

## Scope (v1)

- Webhook receiver: installation events, push to default branch, PR
  opened/synchronize. **Done** — `parseWebhookEvent()`.
- Read `holocron.config.ts` from a repo's default branch only — never a PR
  branch or fork (hard security boundary, D4/D6 in the epic spec). **Done**
  — `validateConfig()`.
- Sync resolved capabilities/profile to GitHub custom properties, extending
  the `syncProperties()` mechanism `@theholocron/holocron-plugin-github`
  already implements.
- Post a single check run reflecting capability-compliance status.

Explicitly out of v1 — tracked in
[#674](https://github.com/theholocron/holocron/issues/674): the App
autonomously triggering autofix PRs or PR comments from a webhook event,
and dashboards.

## `validateConfig({ client, repo })`

Fetches `holocron.config.{ts,js,mjs,cjs,json}` (TS-first probe order) from
`repo`'s default branch via `@theholocron/github-client`'s
`git.getContents()` — which takes no `ref` parameter, so it structurally
can never read a PR branch or fork — and validates its `tasks` array
against `@theholocron/astromech`'s canonical task registry. Returns one of:

| `status`          | Meaning                                                         |
| ----------------- | --------------------------------------------------------------- |
| `"valid"`         | Config loaded; every task name is in the registry.              |
| `"no-config"`     | No `holocron.config.*` in any probed extension.                 |
| `"unknown-tasks"` | Config loaded; `unknownTasks` lists names outside the registry. |
| `"load-error"`    | A `holocron.config.*` exists but couldn't be parsed/executed.   |

Execution reuses `@theholocron/datapad`'s `loadConfigFromContent()`
(fetched content, not a file already on disk — the same `loadFile`
internals `loadConfigFile()` uses locally for `holocron setup`/`sync`,
D8) — so a real
`holocron.config.ts` that does
`import { defineConfig } from "@theholocron/cli"` (the CLI README's own
documented pattern) resolves correctly; the fetched content is written to
a temp directory under this package's own tree specifically so that
upward `node_modules` resolution finds it.

## `parseWebhookEvent({ body, headers, secret })`

Verifies an inbound GitHub App webhook delivery and normalizes the payload
into a `SentinelEvent`. Verification itself — `X-Hub-Signature-256`
(HMAC-SHA256 over the raw body, `timingSafeEqual`-compared) and the
header/payload shapes — is `@theholocron/github-client`'s
`verifyGitHubWebhookSignature()` / `parseGitHubWebhookHeaders()` /
`GitHub*WebhookPayload`: GitHub's own webhook mechanics, owned by the
package that already knows every other GitHub API shape, not
reimplemented here. What's Sentinel's own concern — which event
categories matter in v1, and what a normalized `SentinelEvent` looks
like — stays in this function.

A plain function over `{ body, headers, secret }` — no HTTP framework, no
deploy target assumed, so it slots into whichever runtime
`.notes/tech-sentinel-v1.spec.md`'s still-open deploy-target decision
lands on. Throws `WebhookVerificationError` for a missing/wrong secret, a
missing/malformed signature, a missing `X-GitHub-Event` header, or a body
that isn't valid JSON. Returns one of:

| Result               | Meaning                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ handled: true }`  | One of v1's three event categories — `event` carries the normalized `SentinelEvent`.                                                                                       |
| `{ handled: false }` | A validly-signed delivery outside v1 scope (e.g. a non-default-branch push, `pull_request.closed`, an unrelated `X-GitHub-Event`) — not an error, just not actionable yet. |

`SentinelEventType` is one of `"installation.created"`,
`"installation.deleted"`, `"push.default-branch"`,
`"pull_request.opened"`, `"pull_request.synchronize"`. `repo` and
`installationId` come entirely from the payload — never a hardcoded org
(D10) — so one App registration handles installations across any number
of orgs/accounts unchanged.

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
