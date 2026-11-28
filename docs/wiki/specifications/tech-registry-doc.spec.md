---
id: SPEC-0055
status: archived
discussion:
  url: https://discord.com/channels/1303969001822486568/1566620400165593169
---

<!-- editorconfig-checker-disable-file -->
<!-- markdownlint-disable MD013 MD040 -->

<!-- Implementation: docs#5 (registry-doc: clients, plugins, cli, configs, utils, themes, docs, skills, templates) -->
<!-- Released: @theholocron/registry-doc@1.1.0, 2026-08-22 -->
<!-- Deviated: registry expanded to all org packages (configs, utils, themes, docs, skills, templates) beyond original scope; factory functions renamed (c() → makeClientEntry(), p() → makeHolocronEntry()) for clarity -->
<!-- Deferred: tickets 1.6 + 1.7 (validate-registry scripts in clients + holocron), 1.8 + 1.9 (AGENTS.md updates) -->
<!-- Follow-up: Note 3 (.notes/3-components-doc.md), Note 2 (.notes/2-mdx-migration.md) -->

# Note 1 — `@theholocron/registry-doc`

**Repo:** `theholocron/docs` (new monorepo, bootstrapped from `monorepo-template`)
**Package path:** `packages/registry-doc/`
**Depends on:** nothing — foundation for all other doc work.

---

## Problem

Every docs page, README badge, and cross-repo link hardcodes URLs and package
names. When a new package ships (e.g. `posthog-client`), a dozen places need
updating and some are always missed. There is no single source of truth for
"what is the npm name / docs URL / GitHub URL for this package," and no
mechanism to cross-link between repos (e.g. a holocron plugin page linking to
the matching client docs).

---

## Key design decisions

**Centralized in a dedicated repo, not in `docs-theme` or `configs`.**
The data is cross-repo (clients + plugins + utils), so it needs a home that
isn't already owned by any one concern. A new `theholocron/docs` monorepo makes
this explicit and gives the docs infrastructure its own lifecycle.

**Functions, not exported constants.**
Internal constants (`ORG`, `SCOPE`, `DOCS_BASE`, etc.) are never exported
directly. Every public value goes through a function. This allows:

- `DOCS_BASE` to read `process.env.DOCS_BASE_URL` for staging/preview builds
- Mocking in tests
- Adding parameters later without a breaking change

**No `fromConfig()` adapter.**
An earlier design derived the registry from each repo's `holocron.config.ts`.
Rejected because: it only produces a per-repo view (can't cross-link), and it
couples the Astro build to the CLI package shape. The centralized registry is
simpler and solves cross-linking outright.

---

## Package structure

```
packages/registry-doc/
  src/
    constants.ts    ← internal only; never re-exported
    types.ts        ← types; re-exported from index
    clients.ts      ← client entries; internal
    plugins.ts      ← plugin entries; internal
    utils.ts        ← utils entries; internal (future)
    index.ts        ← public API (all functions)
    validate.ts     ← validateRegistry; exported via /validate subpath
  src/__tests__/
    registry.test.ts
    validate.test.ts
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  package.json
  README.md
```

---

## Implementation

### `src/constants.ts` (private)

```ts
export const ORG = "theholocron";
export const SCOPE = `@${ORG}` as const;
export const DOCS_BASE = process.env.DOCS_BASE_URL ?? "https://docs.theholocron.dev";
export const GITHUB_BASE = `https://github.com/${ORG}`;
export const NPM_BASE = "https://www.npmjs.com/package";
```

### `src/types.ts` (private; types re-exported from index)

```ts
export interface LinkEntry {
  slug: string;
  package: string;
  docsUrl: string;
  npmUrl: string;
  githubUrl: string;
  sandboxUrl?: string;
}

export type LinksRegistry = Record<string, LinkEntry>;
```

### `src/clients.ts` (private)

```ts
import { DOCS_BASE, GITHUB_BASE, NPM_BASE, SCOPE } from "./constants.js";
import type { LinkEntry, LinksRegistry } from "./types.js";

const github = `${GITHUB_BASE}/clients`;

function c(slug: string, docsPath: string, sandboxUrl?: string): LinkEntry {
  const pkg = `${SCOPE}/${slug}`;
  return {
    slug,
    package: pkg,
    docsUrl: `${DOCS_BASE}/clients/${docsPath}`,
    npmUrl: `${NPM_BASE}/${pkg}`,
    githubUrl: github,
    sandboxUrl,
  };
}

export const clients = {
  "clerk-client": c("clerk-client", "clerk"),
  "cloudflare-client": c("cloudflare-client", "cloudflare"),
  "confluence-client": c("confluence-client", "confluence"),
  "doppler-client": c("doppler-client", "doppler"),
  "github-client": c("github-client", "github"),
  "google-client": c("google-client", "google"),
  "http-client": c("http-client", "http"),
  "infisical-client": c("infisical-client", "infisical"),
  "jira-client": c("jira-client", "jira"),
  "neon-client": c("neon-client", "neon"),
  "posthog-client": c("posthog-client", "posthog"),
  "postman-client": c("postman-client", "postman"),
  "sentry-client": c("sentry-client", "sentry"),
  "vercel-client": c("vercel-client", "vercel"),
  "zendesk-client": c("zendesk-client", "zendesk"),
} as const satisfies LinksRegistry;
```

### `src/plugins.ts` (private) — same pattern

```ts
// base: `${DOCS_BASE}/holocron/plugins`, github: `${GITHUB_BASE}/holocron`
// Entry helper: p(slug, docsPath)
export const plugins = {
  "holocron-plugin-1password": p("holocron-plugin-1password", "1password"),
  "holocron-plugin-clerk": p("holocron-plugin-clerk", "clerk"),
  "holocron-plugin-cloudflare": p("holocron-plugin-cloudflare", "cloudflare"),
  "holocron-plugin-discord": p("holocron-plugin-discord", "discord"),
  "holocron-plugin-doppler": p("holocron-plugin-doppler", "doppler"),
  "holocron-plugin-github": p("holocron-plugin-github", "github"),
  "holocron-plugin-infisical": p("holocron-plugin-infisical", "infisical"),
  "holocron-plugin-neon": p("holocron-plugin-neon", "neon"),
  "holocron-plugin-posthog": p("holocron-plugin-posthog", "posthog"),
  "holocron-plugin-postman": p("holocron-plugin-postman", "postman"),
  "holocron-plugin-sentry": p("holocron-plugin-sentry", "sentry"),
  "holocron-plugin-slack": p("holocron-plugin-slack", "slack"),
  "holocron-plugin-vercel": p("holocron-plugin-vercel", "vercel"),
} as const satisfies LinksRegistry;
```

### `src/index.ts` (public API)

```ts
import { DOCS_BASE, GITHUB_BASE, ORG, SCOPE } from "./constants.js";
import { clients } from "./clients.js";
import { plugins } from "./plugins.js";

// Constants — always functions, never raw exports
export const getOrg = (): string => ORG;
export const getScope = (): string => SCOPE;
export const getDocsBaseUrl = (): string => DOCS_BASE;
export const getGitHubBaseUrl = (): string => GITHUB_BASE;

// Registry access
export const getClients = () => clients;
export const getPlugins = () => plugins;
export const getRegistry = () => ({ ...clients, ...plugins });
export const getPackage = (slug: string) => getRegistry()[slug];

// Types (safe to re-export — no runtime value)
export type { LinkEntry, LinksRegistry } from "./types.js";
```

### `src/validate.ts` (exported via `/validate` subpath)

```ts
import type { LinksRegistry } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  missing: string[]; // in workspace, absent from registry
  extra: string[]; // in registry, absent from workspace
}

export function validateRegistry(registry: LinksRegistry, workspacePackages: string[]): ValidationResult {
  const registered = new Set(Object.values(registry).map((e) => e.package));
  const workspace = new Set(workspacePackages);
  const missing = workspacePackages.filter((p) => !registered.has(p));
  const extra = [...registered].filter((p) => !workspace.has(p));
  return { valid: missing.length === 0 && extra.length === 0, missing, extra };
}
```

### `package.json` exports

```json
{
  "name": "@theholocron/registry-doc",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./validate": {
      "types": "./dist/validate.d.ts",
      "import": "./dist/validate.js",
      "default": "./dist/validate.js"
    },
    "./package.json": "./package.json"
  }
}
```

No runtime dependencies — pure TypeScript utility with no external deps.

---

## Usage in consuming repos

```mdx
// clients/docs/src/content/docs/github.mdx
import { getClients } from "@theholocron/registry-doc";
export const entry = getClients()["github-client"];

<PackageHeader entry={entry} />
```

Cross-repo link (holocron plugin → client):

```mdx
// holocron/docs/src/content/docs/plugins/sentry.mdx
import { getClients, getPlugins } from "@theholocron/registry-doc";
export const plugin = getPlugins()["holocron-plugin-sentry"];
export const client = getClients()["sentry-client"];

This plugin uses [{client.package}]({client.docsUrl}) under the hood.
```

---

## Drift prevention

### 1. TypeScript (`as const satisfies LinksRegistry`)

Adding a slug with a typo or wrong shape is a compile error.

### 2. Validate scripts in consuming repos

Each of `clients` and `holocron` gets `scripts/validate-registry.ts`:

```ts
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { getClients, getPlugins } from "@theholocron/registry-doc";
import { validateRegistry } from "@theholocron/registry-doc/validate";

// Collect published packages from this workspace
const names: string[] = [];
for await (const path of glob("packages/*/package.json")) {
  const pkg = JSON.parse(await readFile(path, "utf-8"));
  if (!pkg.private) names.push(pkg.name);
}

// clients repo validates against getClients(); holocron against getPlugins()
const result = validateRegistry(getClients(), names);
if (!result.valid) {
  /* print diff, process.exit(1) */
}
```

Runs as `tsx scripts/validate-registry.ts` in the `audit` CI job.

### 3. CLAUDE.md / AGENTS.md

Add to every repo's agent instructions:

> When adding a new client or plugin package, open a follow-up PR in
> `theholocron/docs` to add the entry to `packages/registry-doc/src/`.

### 4. Updated skills

`holocron-skill-client` and `holocron-skill-plugin` include the registry-doc
PR as a named step in the new-package checklist.

---

## Tickets

| #   | Repo              | PR title                                                                         |
| --- | ----------------- | -------------------------------------------------------------------------------- |
| 1.1 | `docs`            | `feat: bootstrap theholocron/docs from monorepo-template`                        |
| 1.2 | `docs`            | `feat(registry-doc): scaffold package with types + empty registries`             |
| 1.3 | `docs`            | `feat(registry-doc): add clients registry`                                       |
| 1.4 | `docs`            | `feat(registry-doc): add plugins registry`                                       |
| 1.5 | `docs`            | `feat(registry-doc): add validateRegistry utility`                               |
| 1.6 | `clients`         | `feat: add validate-registry script + audit CI step`                             |
| 1.7 | `holocron`        | `feat: add validate-registry script + audit CI step`                             |
| 1.8 | `clients`         | `chore(docs): update AGENTS.md — add registry-doc step to new-package checklist` |
| 1.9 | `.github-private` | `docs: update AGENTS.md pre-task rules (fresh branch, docs required)`            |

1.1 → 1.2 → 1.3 + 1.4 (parallel) → 1.5 → 1.6 + 1.7 (parallel) → 1.8 + 1.9.
