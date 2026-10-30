---
status: archived
---

<!-- editorconfig-checker-disable-file -->
<!-- markdownlint-disable MD013 MD040 -->

<!-- Moved from the archived theholocron/docs repo (.notes/archive/readme-sync.spec.md, identical to .notes/4-readme-sync.md). Design record for sync-readme, which was kept; the components-doc and registry-doc pieces it relied on are retired. -->

# Note 4 — README + docs sync template

**Repos affected:** `theholocron/docs` (new components), `theholocron/holocron` (CLI
extension), all repos with docs
**Depends on:** Notes 1, 2, 3 — `registry-doc` data + `components-doc` components.

---

## Problem

Every repo's `README.md` and `docs/src/content/docs/index.mdx` describe the same
project from different angles and drift apart over time. `holocron sync-readme`
already syncs the `description` marker block from `holocron.config.ts`, but everything
else — packages table, install instructions, development scripts, releases link — is
maintained by hand and gets stale.

The components (Note 3) and registry (Note 1) already exist. The data needed to
generate both surfaces is already structured. What's missing is the assembly layer.

---

## Design: one template, two renderers

A `RepoTemplate` config type describes the repo's shape. Two renderers consume it:

- **Astro component** (`<RepoIndex>`) → renders the docs `index.mdx` landing page
- **Markdown generator** (`generateReadme()`) → produces README marker-block content

`holocron sync-readme` calls the markdown generator and writes each section into the
appropriate `<!-- holocron:xxx -->` marker block in `README.md`. The docs index calls
`<RepoIndex>` directly at build time.

Both pull from the same source: `registry-doc` for package data,
`holocron.config.ts` for description, `package.json` for scripts and package name.

---

## Section inventory

Each section appears conditionally based on repo type.

| Section             | When                              | Source                                                                        |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| **Title**           | Always                            | `package.json` `name` — rendered as inline code: `` `@theholocron/clients` `` |
| **Description**     | Always                            | `holocron.config.ts` `description` field                                      |
| **Getting Started** | Templates only                    | Static content: how to scaffold from this template                            |
| **What's Included** | Templates only                    | Static content: what the template ships                                       |
| **Packages**        | Monorepos                         | `registry-doc` — `getClients()`, `getPlugins()`, `getUtils()`, etc.           |
| **Installation**    | Non-monorepos or root of any repo | `package.json` `name` — `pnpm add <pkg>`                                      |
| **Usage**           | Always                            | Custom — `<!-- holocron:usage -->` marker; user-maintained                    |
| **Custom**          | Optional                          | `<!-- holocron:custom -->` marker; user-maintained; omitted if empty          |
| **Development**     | Always                            | `package.json` `scripts` — filtered to the standard set                       |
| **Releases**        | Always                            | Standard text; URL derived from `holocron.config.ts` `homepage`               |

### Repo type matrix

| Repo                      | Type     | Gets Packages | Gets Installation | Gets Getting Started |
| ------------------------- | -------- | ------------- | ----------------- | -------------------- |
| `clients`                 | monorepo | ✓ (clients)   | —                 | —                    |
| `holocron`                | monorepo | ✓ (plugins)   | ✓ (cli)           | —                    |
| `utils`                   | monorepo | ✓ (utils)     | —                 | —                    |
| `themes`                  | monorepo | ✓ (themes)    | —                 | —                    |
| `configs`                 | monorepo | ✓ (configs)   | —                 | —                    |
| `docs`                    | monorepo | ✓ (docs)      | —                 | —                    |
| `skills`                  | single   | —             | ✓                 | —                    |
| `cli-template`            | template | —             | ✓                 | ✓                    |
| `node-template`           | template | —             | ✓                 | ✓                    |
| `react-template`          | template | —             | ✓                 | ✓                    |
| `monorepo-template`       | template | —             | ✓                 | ✓                    |
| `nextjs-template`         | template | —             | ✓                 | ✓                    |
| `monorepo-react-template` | template | —             | ✓                 | ✓                    |

### Development section — script filter

Parse root `package.json` `scripts`. Show only these keys (if present), in this order:

```
build  dev  preview  start  docs:dev  docs:build  docs:preview
lint   test  test:coverage  test:storybook  test:cypress
typecheck  audit
```

Omit: `release`, `prepare`, `postbuild`, `format`, `holocron`, `start:storybook`,
`build:storybook`, `build:storybook:chromatic`, `prepreview`.

### Releases section

Standard across all repos:

```md
Automated via [semantic-release](https://semantic-release.gitbook.io/semantic-release/).
See the [releases page]({homepage}/releases) and [CHANGELOG.md](./CHANGELOG.md).
```

`homepage` comes from `package.json` `homepage` field (already set on every repo).

---

## `<RepoIndex>` Astro component

Lives in `@theholocron/components-doc`. Accepts a `RepoIndexProps` and renders the
standard docs landing page — replaces every repo's hand-written `index.mdx` body.

```tsx
interface RepoIndexProps {
  type: "clients" | "plugins" | "utils" | "themes" | "configs" | "docs" | "skills";
  // type drives which registry getter + PackageGrid variant to use
}
```

Usage:

```mdx
---
title: Clients
description: API clients and shared HTTP primitives.
sidebar:
  hidden: true
---

import { RepoIndex } from "@theholocron/components-doc";

<RepoIndex type="clients" />
```

`<RepoIndex>` internally calls the appropriate registry getter and renders
`<PackageGrid>` (monorepos) or the appropriate alternative (single packages).

---

## `generateReadme()` — markdown generator

Exported from `@theholocron/components-doc/markdown` (new subpath). Returns an
object of named markdown strings, one per marker block:

```ts
interface ReadmeSections {
  description: string; // <!-- holocron:description -->
  packages?: string; // <!-- holocron:packages -->
  installation?: string; // <!-- holocron:installation -->
  development: string; // <!-- holocron:development -->
  releases: string; // <!-- holocron:releases -->
}

function generateReadme(config: RepoTemplateConfig): ReadmeSections;
```

`RepoTemplateConfig` is assembled by `holocron sync-readme` from `holocron.config.ts`,
`package.json`, and the appropriate `registry-doc` getter.

---

## `sync-readme` extension (holocron CLI)

Extends the existing `sync-readme` command with two new steps:

```
sync-readme now does:
  1. Read description from holocron.config.ts                  (existing)
  2. Write <!-- holocron:description --> in README.md           (existing)
  3. Write <!-- holocron:installation --> in README.md          (existing)
  4. Detect repo type (monorepo / single / template)            (new)
  5. Call generateReadme() with type + registry + scripts       (new)
  6. Write <!-- holocron:packages --> if monorepo               (new)
  7. Write <!-- holocron:development --> from filtered scripts   (new)
  8. Write <!-- holocron:releases --> standard text             (new)
  9. If docs/src/content/docs/index.mdx exists:
       update frontmatter description field                     (new, small)
```

Marker blocks not present in a README are silently skipped. New repos start with the
full marker set; existing repos can adopt incrementally.

---

## README marker set

Each repo's `README.md` uses these markers. Content between them is replaced on every
`sync-readme` run.

```md
# `@theholocron/<name>`

<!-- holocron:description -->

…description from config…

<!-- /holocron:description -->

<!-- holocron:getting-started -->

…template-only static content…

<!-- /holocron:getting-started -->

<!-- holocron:packages -->

…generated packages table…

<!-- /holocron:packages -->

<!-- holocron:installation -->

…generated install block…

<!-- /holocron:installation -->

## Usage

<!-- holocron:usage -->

…user-maintained…

<!-- /holocron:usage -->

<!-- holocron:custom -->

…user-maintained, optional…

<!-- /holocron:custom -->

## Development

<!-- holocron:development -->

…generated from package.json scripts…

<!-- /holocron:development -->

## Releases

<!-- holocron:releases -->

…generated standard text…

<!-- /holocron:releases -->
```

`<!-- holocron:getting-started -->`, `<!-- holocron:packages -->`, and
`<!-- holocron:custom -->` are omitted from non-template / non-monorepo / no-custom
READMEs respectively.

---

## Tickets

| #   | Repo       | PR title                                                               | Notes                                                                     |
| --- | ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 4.1 | `docs`     | `feat(components-doc): add RepoIndex component`                        | New Astro component; calls registry getter based on `type` prop           |
| 4.2 | `docs`     | `feat(components-doc): add generateReadme markdown generator`          | New `/markdown` subpath; `generateReadme()` returns named section strings |
| 4.3 | `holocron` | `feat(sync-readme): generate packages, development, releases sections` | Extends sync-readme; imports generateReadme from components-doc           |
| 4.4 | `holocron` | `feat(sync-readme): update docs/index.mdx frontmatter description`     | Small targeted YAML update; can combine with 4.3                          |
| 4.5 | all repos  | `chore: adopt sync-readme marker blocks in README`                     | Add marker blocks to each repo's README; run sync-readme to populate      |
| 4.6 | all repos  | `refactor(docs): adopt RepoIndex in docs index.mdx`                    | Replace hand-written index.mdx body with `<RepoIndex type="..." />`       |

4.3 + 4.4 can be one PR. 4.5 + 4.6 are per-repo and can be batched like Note 2.
