# Architectural Decision Records

ADRs live here. Each file captures one architectural decision, the options
that were considered, and the rationale for the choice made.

## Format

Use the [MADR](https://adr.github.io/madr/) format. Scaffold a new ADR with:

```sh
npx madr new "title of the decision"
```

Or copy `template.md` and number it sequentially (`0001-…`, `0002-…`).

## Status values

| Status | Meaning |
|---|---|
| `proposed` | Under discussion — not yet accepted |
| `accepted` | In effect |
| `rejected` | Considered and declined |
| `deprecated` | Was accepted; no longer relevant |
| `superseded` | Replaced by a later ADR (link in frontmatter) |

## Index

| ID | Title | Status |
|---|---|---|
| [ADR-0001](0001-vault-provider-doppler-and-infisical.md) | Vault provider — Doppler and Infisical over 1Password | accepted |
| [ADR-0002](0002-interactive-menu-spawn-over-reparse.md) | Interactive CLI menu — spawn over re-parse | accepted |
