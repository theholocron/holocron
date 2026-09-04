---
status: proposed
issue: theholocron/holocron#503
blocked-by: []
related:
  - theholocron/holocron/.notes/wiki-capability.spec.md
  - theholocron/holocron/.notes/knowledge-system.spec.md
  - theholocron/.github-private#65
---

# `sync --steps wiki` — auto-generated Fern products switcher

Extends `holocron sync` with a `wiki` step that discovers all org repos
with a wiki configured and injects a `products:` block into each repo's
own `fern/docs.yml`, making a global wiki switcher appear on every wiki
page across all repos.

---

## Motivation

The Fern wiki system spans multiple repos, each publishing to a basepath
under `wiki.theholocron.dev`. Once you navigate to a repo's wiki you
have no way to discover or switch to another — users must know the
basepath directly.

Fern supports a `products:` block in `docs.yml` that renders a global
switcher in the header. Since `products:` and `tabs:` are independent
fields (not mutually exclusive — verified against the Fern schema), the
switcher can sit alongside each repo's existing tab navigation. Every
wiki page on every repo shows the same global switcher.

Keeping the switcher manually in sync across repos as new wikis are
added is error-prone. The `wiki` sync step automates this.

---

## Goals

- `holocron sync --steps wiki` discovers all org repos with `providers.wiki`
  and merges a `products:` block into each repo's own `fern/docs.yml`
- Adding a wiki to any new repo and running the sync automatically
  propagates the updated switcher to all other wiki-enabled repos
- Metadata for each product card (subtitle, icon) is sourced from the
  wiki provider options + `config.description` — no manual card content
- The step follows the same local-step pattern as `readme` and `workflows`
  — writes to the current repo's own files, committed by the existing
  `auto-commit` + PR flow
- `sync-dispatch` triggers the step across all repos when any wiki changes

## Non-goals

- Fern dashboard "Connect repo" automation — still manual
- Generating the full `fern/docs.yml` from scratch — only the `products:`
  block is managed; everything else remains hand-maintained
- Ordering beyond alphabetical by basepath

---

## Schema verification

Confirmed via `https://schema.buildwithfern.dev/docs-yml.json`:

- `products` and `tabs` are both independent nullable top-level properties
- No `oneOf`/`anyOf` makes them mutually exclusive
- `InternalProduct` has a `path` field for sub-navigation within a product
- They can coexist in the same `docs.yml`

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
provider options — the card subtitle comes from the field they already
maintain.

These fields are valid in `ProviderOptions` (`Record<string, unknown>`)
— no schema change needed until a `WikiFernOptions` interface is added.

---

## Generated output

The `wiki` step merges a `products:` block into each wiki-enabled repo's
`fern/docs.yml`. The block is bounded by generator markers so subsequent
runs can replace it without touching anything else in the file:

```yaml
# --- BEGIN holocron:wiki-products (auto-generated, do not edit) ---
products:
  - display-name: Internal
    subtitle: Org conventions, engineering workflow, architecture
    icon: fa-duotone fa-lock
    href: /internal
  - display-name: Holocron
    subtitle: A pluggable, capability-based CLI for spinning up and operating software projects
    icon: fa-duotone fa-gear
    href: /holocron
  - display-name: Skills
    subtitle: Shared agent skills for Claude Code and Codex
    icon: fa-duotone fa-bolt
    href: /skills
# --- END holocron:wiki-products ---
```

The markers allow the step to identify and replace only the managed
block on subsequent runs — the same pattern used by `sync-readme` for
the `<!-- holocron:installation -->` blocks in README files.

Everything else in `fern/docs.yml` (instances, tabs, navigation, colors,
logo, edit-this-page) is untouched.

---

## Discovery algorithm

```
1. Read all org repos via GitHub API (paginated)
2. For each repo, attempt to fetch holocron.config.ts / holocron.config.json
3. Parse providers — look for a wiki entry
4. Extract:
     - basepath: last segment of domain
       (e.g. "holocron" from "wiki.theholocron.dev/holocron")
     - display-name: basepath, title-cased (e.g. "holocron" → "Holocron")
     - subtitle: wiki.subtitle option → config.description → omit
     - icon: wiki.icon option → omit
5. Sort alphabetically by basepath
6. Generate the products block with markers
7. Merge into the current repo's fern/docs.yml:
     - If markers exist: replace the content between them
     - If no markers: append the block at end of file
```

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

Add to `LOCAL_STEPS` — no provider token needed beyond the existing
`HOLOCRON_READ_TOKEN` → `GH_TOKEN` → `github.token` chain.

### Guard: only runs when wiki is configured

```ts
const wikiProvider = config.providers.wiki;
if (!wikiProvider) {
  return { step: "sync wiki", status: "skipped", message: "no wiki provider configured" };
}
```

Unlike the previous design, no `holocron`-only guard is needed — every
wiki-enabled repo runs this step and updates its own file.

### New file: `packages/cli/src/commands/sync-wiki.ts`

```ts
export interface WikiProduct {
  displayName: string;
  basepath: string;
  subtitle?: string;
  icon?: string;
}

export async function discoverWikiProducts(org: string, token: string): Promise<WikiProduct[]>;
export async function generateProductsBlock(products: WikiProduct[]): string;
export async function mergeProductsBlock(docsYml: string, block: string): string;
export async function runSyncWiki(input: RunSyncWikiInput): Promise<SetupStepResult>;
```

### Commit + PR flow

No change needed. The step writes to `fern/docs.yml` in the current
repo checkout. The existing `auto-commit` action in each repo's
`sync.yml` thin caller picks up the change and opens a PR — exactly
the same as `readme` and `workflows` steps today.

When a new wiki is added to any repo, `sync-dispatch` fires and triggers
`holocron sync --steps wiki` across all wiki-enabled repos, propagating
the updated switcher everywhere in one shot.

---

## Open questions

1. **Marker vs append** — the marker approach (`BEGIN/END holocron:wiki-products`)
   is the cleanest for idempotent updates but requires the initial merge
   to append the block. Alternative: require `fern/docs.yml` to already
   contain the markers (added by `holocron setup` when wiki is first
   configured). This is consistent with how `sync-readme` works — setup
   writes the initial markers, sync fills them.

2. **Product ordering** — alphabetical by basepath is the default.
   Should `internal` always sort first since it's the default path?
   Could be a fixed rule or a `priority` field in the wiki provider options.
