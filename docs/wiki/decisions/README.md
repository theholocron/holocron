# Architectural Decision Records

ADRs live here. Each file captures one architectural decision, the options
that were considered, and the rationale for the choice made.

## Format

Use the [MADR](https://adr.github.io/madr/) format. To create a new ADR,
copy `template.md` and number it sequentially (`0001-…`, `0002-…`):

```sh
cp docs/wiki/decisions/template.md docs/wiki/decisions/000N-short-title.md
```

`madr` has no CLI — creation is manual. Frontmatter is validated automatically
in CI via `scripts/validate-adrs.mjs` (runs as part of the Lint workflow).

## Status values

| Status       | Meaning                                       |
| ------------ | --------------------------------------------- |
| `proposed`   | Under discussion — not yet accepted           |
| `accepted`   | In effect                                     |
| `rejected`   | Considered and declined                       |
| `deprecated` | Was accepted; no longer relevant              |
| `superseded` | Replaced by a later ADR (link in frontmatter) |

## Index

| ID                                                                        | Title                                                                      | Status     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| [ADR-0001](0001-vault-provider-doppler-and-infisical.md)                  | Vault provider — Doppler and Infisical over 1Password                      | accepted   |
| [ADR-0002](0002-interactive-menu-spawn-over-reparse.md)                   | Interactive CLI menu — spawn over re-parse                                 | accepted   |
| [ADR-0003](0003-auth-bootstrap-keyring-token-precedence.md)               | Auth bootstrap — OS keyring as fourth-precedence token layer               | accepted   |
| [ADR-0004](0004-adr-home-repo-over-wiki.md)                               | ADR home — Git repository over GitHub Wiki                                 | accepted   |
| [ADR-0005](0005-npm-publishing-strategy-oidc-over-staged.md)              | npm publishing strategy — OIDC Trusted Publishers over staged publishing   | accepted   |
| [ADR-0006](0006-wiki-navbar-auto-broadcast.md)                            | Auto-broadcast wiki navbar sync on push                                    | accepted   |
| [ADR-0007](0007-structured-logging-pino-axiom.md)                         | Structured logging — Pino + Axiom                                          | accepted   |
| [ADR-0008](0008-cli-usage-telemetry-posthog.md)                           | CLI usage telemetry — PostHog                                              | accepted   |
| [ADR-0009](0009-astromech-task-runner-package.md)                         | Astromech — the task-runner + CI-parity package (`@theholocron/astromech`) | accepted   |
| [ADR-0010](0010-datapad-config-loader.md)                                 | Datapad — the shared config loader (`@theholocron/datapad`)                | accepted   |
| [ADR-0011](0011-sentinel-deploy-target-vercel-over-cloudflare-workers.md) | Sentinel's deploy target — Vercel Functions over Cloudflare Workers        | accepted   |
| [ADR-0012](0012-axiom-dataset-scoping-execution-context.md)               | Axiom dataset scoping — execution context over blanket local/CI            | accepted   |
| [ADR-0013](0013-checkly-monitoring-holocron-plugin.md)                    | Checkly uptime monitoring — holocron plugin over monitoring-as-code CLI    | accepted   |
| [ADR-0014](0014-sourcery-github-app-no-plugin.md)                         | Sourcery AI PR review — GitHub App install, not a holocron plugin          | accepted   |
| [ADR-0015](0015-postman-tooling-plugin-over-bruno-insomnia-stoplight.md)  | Tooling capability — Postman over Bruno, Insomnia, and Stoplight Elements  | accepted   |
| [ADR-0016](0016-mit-as-the-unified-license.md)                            | License — MIT for the whole monorepo                                       | accepted   |
| [ADR-0017](0017-holocron-config-preset-system.md)                         | Holocron config preset system (superseded by ADR-0018)                     | superseded |
| [ADR-0018](0018-composable-preset-system.md)                              | Composable preset system                                                   | accepted   |
