# Architectural Decision Records

ADRs live here. Each file captures one architectural decision, the options
that were considered, and the rationale for the choice made.

## Format

Use the [MADR](https://adr.github.io/madr/) format. To create a new ADR,
copy `template.md` and number it sequentially (`0001-…`, `0002-…`):

```sh
cp docs/architecture/adr/template.md docs/architecture/adr/000N-short-title.md
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

| ID                                                          | Title                                                        | Status   |
| ----------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| [ADR-0001](0001-vault-provider-doppler-and-infisical.md)    | Vault provider — Doppler and Infisical over 1Password        | accepted |
| [ADR-0002](0002-interactive-menu-spawn-over-reparse.md)     | Interactive CLI menu — spawn over re-parse                   | accepted |
| [ADR-0003](0003-auth-bootstrap-keyring-token-precedence.md) | Auth bootstrap — OS keyring as fourth-precedence token layer | accepted |
| [ADR-0004](0004-adr-home-repo-over-wiki.md)                 | ADR home — Git repository over GitHub Wiki                   | accepted |
