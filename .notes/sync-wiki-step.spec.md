---
status: proposed
issue: theholocron/holocron#503
blocked-by: []
related:
  - theholocron/holocron/.notes/wiki-capability.spec.md
  - theholocron/holocron/.notes/knowledge-system.spec.md
  - theholocron/.github-private#65
---

# `sync --steps wiki` — auto-generated Fern products landing

Extends `holocron sync` with a `wiki` step that discovers all org repos
with a wiki configured and generates the root Fern `docs.yml` (with a
`products:` landing) in `theholocron/.github-private` automatically.

---

## Motivation

The Fern wiki system spans multiple repos, each publishing to a basepath
under `wiki.theholocron.dev`. There is no top-level landing that surfaces
all wikis — users must know the basepath directly.

Fern supports a `products:` landing page that renders cards linking to
each basepath, but `docs.yml` has no `extends` or `import` — the root
config must be a standalone file. Keeping it manually in sync as new
wikis are added is error-prone and easy to forget.

---

## Goals

- `holocron sync --steps wiki` discovers all repos with `providers.wiki`
  and generates the root `docs.yml` in `theholocron/.github-private`
- Adding a wiki to any repo and syncing automatically surfaces it in the
  root landing — no manual edits
- Metadata for each product card (subtitle, icon) is sourced from the
  wiki provider options in `holocron.config.ts` — no external API calls
- The step is additive to the existing `SYNC_STEPS` list and follows the
  same local-step pattern as `readme` and `workflows`
- Only runs when invoked from the `theholocron/holocron` repo context;
  other repos skip it silently

## Non-goals

- Fern dashboard "Connect repo" automation — still manual
- Generating per-repo `fern/docs.yml` — those are hand-maintained
- Ordering of product cards beyond alphabetical by repo name

---

## Config additions

Each repo's wiki provider options gain two optional display fields:

```ts
// holocron.config.ts
providers: {
  wiki: ["fern", {
    domain: "wiki.theholocron.dev/holocron",
    fernOrg: "holocron",
    // subtitle defaults to config.description — override only when needed
    subtitle: "A more specific card description",
    icon: "fa-duotone fa-gear",
  }],
}
```

| Field      | Type      | Default              | Description                                                                                                                           |
| ---------- | --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `subtitle` | `string?` | `config.description` | One-line description shown on the product card. Falls back to the top-level `description` field in `holocron.config.ts` when omitted. |
| `icon`     | `string?` | none                 | Font Awesome icon class for the card                                                                                                  |

The `description` fallback means most repos need no change to their wiki
provider options — the card subtitle comes from the field they already maintain.

These fields are already valid in `ProviderOptions` (typed as
`Record<string, unknown>`) — no schema change needed until a
`WikiFernOptions` interface is added for type safety.

---

## Generated output

`theholocron/.github-private/fern/docs.yml` is overwritten on each run.
The file is marked with the standard `workflowHeader()` so it is clearly
auto-generated:

```yaml
# AUTO-GENERATED — do not edit directly.
# Source:  theholocron/holocron · packages/cli/src/commands/sync.ts
# Tool:    holocron sync --steps wiki
# Changes: run `holocron sync --steps wiki` in theholocron/holocron to regenerate.

instances:
  - url: holocron.docs.buildwithfern.com/internal
    custom-domain: wiki.theholocron.dev/internal
    multi-source: true

title: Holocron Wiki

edit-this-page:
  github:
    owner: theholocron
    repo: .github-private
    branch: main

navbar:
  links:
    - type: github
      value: https://github.com/theholocron

colors:
  accent-primary:
    dark: "#70E155"
    light: "#008700"

logo:
  height: 20

metadata:
  og:dynamic: true

products:
  - display-name: Internal
    subtitle: Org conventions, engineering workflow, architecture
    icon: fa-duotone fa-lock
    href: /internal
  - display-name: Holocron
    subtitle: CLI engineering knowledge and ADRs
    icon: fa-duotone fa-gear
    href: /holocron
  - display-name: Skills
    subtitle: Agent skills and slash commands
    icon: fa-duotone fa-bolt
    href: /skills
```

The `instances`, `edit-this-page`, `navbar`, `colors`, `logo`, and
`metadata` blocks are fixed — they describe the root site itself and do
not change as wikis are added. Only the `products:` block is dynamic.

---

## Discovery algorithm

```
1. Read all org repos via GitHub API (paginated)
2. For each repo, attempt to fetch `holocron.config.ts` / `holocron.config.json`
3. Parse providers — look for a `wiki` entry
4. Extract from the wiki provider options + top-level config:
     - basepath: last segment of `domain` (e.g. "holocron" from "wiki.theholocron.dev/holocron")
     - display-name: repo name, title-cased (e.g. "holocron" → "Holocron")
     - subtitle: `wiki.subtitle` option → `config.description` → omit
     - icon: from `icon` option, or omit
5. Sort entries alphabetically by basepath
6. Generate the products block and write to .github-private/fern/docs.yml
```

The `.github-private` repo itself is excluded from the product list — it
IS the root landing, not a child product. Its fixed `instances` block
already declares the root URL.

---

## Implementation

### New sync step: `wiki`

Add `"wiki"` to `SYNC_STEPS` in `packages/cli/src/commands/sync.ts`:

```ts
export const SYNC_STEPS = [
  "labels",
  "properties",
  "teams",
  "topics",
  "keywords",
  "description",
  "homepage",
  "readme",
  "workflows",
  "wiki", // ← new
] as const;
```

Add to `LOCAL_STEPS` — no provider token needed (reads config from
GitHub API using the existing `HOLOCRON_READ_TOKEN` / `GH_TOKEN`
resolution).

### New file: `packages/cli/src/commands/sync-wiki.ts`

```ts
export interface WikiProduct {
  displayName: string;
  basepath: string;
  subtitle?: string;
  icon?: string;
}

export async function runSyncWiki(input: RunSyncWikiInput): Promise<SetupStepResult>;
```

Responsibilities:

- Discovers repos with wiki provider via GitHub search API
- Builds `WikiProduct[]`
- Generates `docs.yml` string using `workflowHeader()` + fixed header + dynamic products block
- Writes to `<repoRoot>/../github-private/fern/docs.yml` (relative path convention matching the sibling checkout layout)

### Token resolution

Uses existing `HOLOCRON_READ_TOKEN` → `GH_TOKEN` → `github.token`
chain — only needs read access to fetch `holocron.config.*` files
from each repo.

### Guard: only runs in holocron context

```ts
if (config.name !== "holocron") {
  return { step: "sync wiki", status: "skipped", message: "only runs in theholocron/holocron" };
}
```

---

## Commit + PR flow

The `wiki` step writes to `../github-private/fern/docs.yml`. The
existing `setup.yml` in `theholocron/holocron` already handles the
auto-commit + PR flow for the `sync` step. The `wiki` step piggybacks
on this — after `runSyncWiki` writes the file, the `auto-commit` action
picks up the change and opens a PR in `.github-private`.

---

## Open questions

1. **Sibling path assumption** — the step writes to `../github-private/`
   which assumes the sibling checkout convention. In CI, both repos need
   to be checked out. The `setup.yml` workflow would need a second
   `actions/checkout` step for `.github-private` before running the wiki
   step. Alternative: use the GitHub API to commit the file directly
   without a local checkout.

2. **Fixed header content** — `instances`, `edit-this-page`, `navbar`,
   `colors`, `logo` are currently hardcoded in the generator. Should
   these be configurable via a `holocron.config.ts` field, or is
   hardcoding to the `.github-private` site acceptable given there is
   exactly one root wiki site?

3. **Product ordering** — alphabetical by basepath is the default. Should
   there be a way to pin specific products to the top (e.g. `internal`
   always first)?
