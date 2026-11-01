---
id: SPEC-0053
status: archived
---

<!-- editorconfig-checker-disable-file -->
<!-- markdownlint-disable MD013 MD040 -->

<!-- Moved from the archived theholocron/docs repo (.notes/archive/mdx-migration.spec.md); superseded by the single docs site (docs-architecture.spec.md). -->

# Note 2 — MDX migration

**Repos affected:** `theholocron/themes`, `theholocron/clients`, `theholocron/holocron`,
`theholocron/utils`, `theholocron/skills`
**Depends on:** Note 1 (`@theholocron/registry-doc` published), Note 3
(`@theholocron/components-doc` published). Convert and adopt components in one
PR per repo — no intermediate "renamed but still hardcoded" state.

---

## Problem

`.md` files can't import from JavaScript modules. Every URL, package name, and
badge is a hardcoded string that must be updated manually. There is no way to
use `registry-doc` data or reusable components without switching to MDX.

Storybook's docs addon also uses MDX, so components built for Astro docs reuse
there without a format conversion.

---

## Decision: MDX over remark plugin

A remark plugin approach (transforming `{link:github-client:npm}` tokens) was
considered. Rejected because it's non-standard, invisible to editors and type
checkers, and can't be reused in Storybook.

MDX is the standard. Starlight supports it natively. The per-page import
overhead is mitigated by the component layer (Note 3) which keeps imports to
2–3 lines per page.

**Do conversion and component adoption in one PR per repo.** Rename `.md` → `.mdx`
and use components in the same commit. No two-step migration.

**Open all repo PRs simultaneously** so none gets stranded. Merge as a batch
after all pass CI.

---

## MDX import pattern

```mdx
// Relative to docs/src/content/docs/ (two levels up to repo root)
import { getClients } from "@theholocron/registry-doc";
import { PackageHeader, Installation } from "@theholocron/components-doc";

export const entry = getClients()["github-client"];

<PackageHeader entry={entry} />
<Installation package={entry.package} />
```

For pages in subdirectories (e.g. `plugins/sentry.mdx`), the `registry-doc`
import is a package import — no relative path needed.

A root tsconfig path alias (`"~/*": ["./*"]`) resolves any lingering relative
import depth issues. Add this in the themes MDX enablement PR.

---

## TypeDoc integration (`starlight-typedoc`)

`starlight-typedoc` auto-generates API reference pages from JSDoc + TypeScript
types. This supersedes the manually-maintained `## Exports` / `## Namespaces`
tables that currently end every client/plugin page.

In `astro.config.ts` of each consuming repo:

```ts
import starlightTypeDoc from "starlight-typedoc";

starlight({
  plugins: [
    docsTheme(),
    starlightTypeDoc({
      entryPoints: ["./packages/*/src/index.ts"],
      tsconfig: "./tsconfig.json",
      sidebar: { label: "API Reference", collapsed: true },
    }),
  ],
}),
```

The manually-written MDX pages keep: header, install, usage examples. The API
reference section becomes a link to the auto-generated TypeDoc page rather than
a hand-maintained table.

`eslint-plugin-jsdoc` enforces JSDoc completeness on all exported functions in
consuming repos. This lives in `@theholocron/eslint-config` as an opt-in preset
(`/jsdoc`), not in `registry-doc`.

---

## Tickets

| #   | Repo       | PR title                                                 | Notes                                              |
| --- | ---------- | -------------------------------------------------------- | -------------------------------------------------- |
| 2.1 | `themes`   | `feat(docs-theme): verify MDX + add tsconfig path alias` | Test `.mdx` works; add `~` alias                   |
| 2.2 | `themes`   | `feat(docs-theme): integrate starlight-typedoc`          | Plugin config + sidebar wiring                     |
| 2.3 | `configs`  | `feat(eslint-config): add /jsdoc preset`                 | `eslint-plugin-jsdoc` rules for exported functions |
| 2.4 | `clients`  | `refactor(docs): convert to MDX + adopt components`      | All pages; combined with Note 3 adoption           |
| 2.5 | `holocron` | `refactor(docs): convert to MDX + adopt components`      | Plugin pages; combined with Note 3 adoption        |
| 2.6 | `utils`    | `refactor(docs): convert to MDX + adopt components`      | Same pattern                                       |
| 2.7 | `skills`   | `refactor(docs): convert to MDX + adopt components`      | Same pattern                                       |

2.1 + 2.3 must publish before 2.4–2.7. Open 2.4–2.7 as a batch and merge together.
