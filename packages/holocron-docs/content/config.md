---
title: Configuration
description: Complete reference for holocron.config.ts — providers, repo metadata, workflows, skills, and more.
---

Holocron looks for `holocron.config.ts` (preferred) or `holocron.config.json` in the current working directory (or the path passed to `--cwd`). TypeScript configs require `@theholocron/holocron-config` as a dev dependency.

## Full schema

```ts
import { defineConfig } from "@theholocron/holocron-config";

export default defineConfig({
  // Project name. Derived from package.json#name when absent.
  name: "my-project",

  // Short description. Written to package.json#description and the GitHub repo by `holocron sync`.
  description: "Short description",

  // Project homepage. Synced to package.json#homepage and the GitHub repo's website field.
  homepage: "https://github.com/my-org/my-project",

  // Repository identity and metadata.
  repo: {
    // "owner/name" — injected into every plugin's context so --repo isn't needed on every call.
    name: "my-org/my-project",

    // Branch protection preset applied by `holocron setup`.
    // "balanced" — squash merge only, delete branch on merge, no force-push.
    // "strict"   — same + required status checks (from requiredChecks[]).
    // "none"     — no protection applied.
    protection: "balanced",

    // Status check names required when protection is "strict".
    requiredChecks: ["Test / Run tests", "Typecheck / tsc --noEmit"],

    // GitHub teams granted repo access. String shorthand → push (Write) permission.
    teams: ["my-org/engineers", { slug: "my-org/bots", permission: "push" }],

    // GitHub repository topics.
    topics: ["typescript", "node", "cli"],

    // GitHub org-level custom properties synced by `holocron setup`.
    properties: {
      lifecycle: "active",           // "active" | "experimental" | "deprecated"
      open_source: true,
      runtime_environment: "node",   // "node" | "browser" | "universal" | "none"
      uses_external_packages: true,
    },
  },

  // CI workflow thin callers written by `holocron setup`.
  // String form: use default inputs. Object form: pass custom `with:` inputs.
  // Supported: "lint" | "test" | "typecheck" | "codeql" | "review" |
  //            "release" | "stale" | "greetings" | "dependencies" | "bookkeeping" | "audit"
  workflows: [
    "lint",
    "test",
    "typecheck",
    { name: "release", with: { "run-build": false } },
    "stale",
    "greetings",
  ],

  // Agent runtime — determines where skills are installed.
  // "claude" → .claude/skills/<name>  (symlinks to .agents/skills/<name>)
  agent: "claude",

  // Skill names from @theholocron/skills to install via `holocron setup`.
  skills: ["git-safety", "pr-workflow", "commit-standards", "security-review"],

  // Capability → provider bindings.
  providers: {
    source: "github",
    ci: "github",
    secrets: "github",
    environments: "github",
    issues: "github",
    vault: ["1password", { vault: "acme-app" }],
    deployment: ["vercel", { teamId: "team_xxx" }],
    storage: "neon",
    auth: "clerk",
    tooling: ["postman"],
  },
});
```

## Provider entry forms

Holocron supports multiple entry forms for flexibility:

```ts
// Short form — single provider, no options
"source": "github"

// Tuple form — single provider with options
"deployment": ["vercel", { teamId: "team_xxx" }]

// Multi form — multiple providers (only for "many" cardinality capabilities)
"tooling": ["postman", "other-tool"]

// Multi with options
"notifications": [
  ["slack",   { channel: "#ops" }],
  ["discord", { webhook: "env:HOOK" }],
]
```

Short provider names (e.g. `"github"`) are resolved to `@theholocron/holocron-plugin-github`. Fully-qualified package names and community plugins (prefixed `holocron-plugin-`) are passed through verbatim.

## Capability cardinality

| Capability | Cardinality | Description |
| --- | --- | --- |
| `source` | single | Repository + branch + workflow file operations |
| `ci` | single | CI run listing and status |
| `secrets` | single | CI/platform secret sync destination |
| `environments` | single | Named deployment environments |
| `issues` | single | Issue tracker (create, search, transition) |
| `deployment` | single | Preview and production deployment |
| `storage` | single | Database branch management |
| `auth` | single | Identity provider |
| `vault` | single | Secret source-of-truth |
| `dns` | single | DNS record management |
| `tooling` | **many** | Sync external tool state |
| `notifications` | **many** | Send messages |
| `analytics` | **many** | Analytics providers |
| `observability` | **many** | Observability providers |

`many` capabilities accept a list of providers; `single` accept exactly one.

## JSON format

If you prefer not to use TypeScript:

```json
{
  "name": "my-project",
  "description": "Short description",
  "repo": {
    "name": "my-org/my-project",
    "protection": "balanced",
    "topics": ["typescript", "node"]
  },
  "workflows": ["lint", "test"],
  "providers": {
    "source": "github",
    "vault": ["doppler", { "project": "my-project", "config": "prd" }]
  }
}
```

JSON repos (like `.github` and `.github-private`) use `holocron.config.json` since they have no `package.json` to install TypeScript.

## Global options

All commands accept these flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--dry-run` | `false` | Print mutations without executing them |
| `--token <value>` | — | Override provider token for this invocation |
| `--cwd <path>` | `process.cwd()` | Directory to search for config |

### `--token` forms

```bash
# Bare: fallback token for single-provider commands
holocron setup --token ghp_xxx

# Keyed: target a specific provider
holocron setup --token github=ghp_xxx

# Multiple keyed tokens
holocron setup --token github=ghp_xxx --token vercel=v_yyy
```
