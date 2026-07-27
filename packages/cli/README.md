<!-- editorconfig-checker-disable-file -->

# `@theholocron/cli`

The Holocron CLI — a pluggable, capability-based orchestrator for
spinning up and operating software projects.

## Install

<!-- prettier-ignore -->
```bash
npm i -g @theholocron/cli@alpha
holocron --help

```

## Config file

Holocron reads `holocron.config.{json,js,ts}` from the project root
(priority: json → js → ts).

**JSON** (simplest):

<!-- prettier-ignore -->
```jsonc
// holocron.config.json
{
  "name": "my-app",
  "providers": {
    "vault": ["1password", { "vault": "my-app" }],
    "source": "github",
  },
}

```

**JS/TS** — use `defineConfig` for autocomplete and type-checking:

<!-- prettier-ignore -->
```ts
// holocron.config.ts
import { defineConfig } from "@theholocron/cli";

export default defineConfig({
  name: "my-app",
  providers: {
    vault: ["1password", { vault: "my-app" }],
    source: "github",
  },
});

```

### Auto-derived fields

`name` and `repo.name` are optional. When absent, Holocron fills them
in at load time:

| Field       | Derived from                                         | Fallback           |
| ----------- | ---------------------------------------------------- | ------------------ |
| `name`      | `package.json` → `name` field (scope stripped)       | directory basename |
| `repo.name` | `git remote get-url origin` (parsed to `owner/repo`) | not set            |

A minimal config — for repos with a `package.json` and a GitHub remote
— only needs `providers`:

### repo options

Additional `repo` fields recognised by `holocron setup`:

| Field             | Type                                    | Description                                                                                                                                                                |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo.teams`      | `Array<string \| { slug, permission }>` | GitHub teams granted repo access. String shorthand defaults to `push` (Write). `holocron setup` also writes `.github/CODEOWNERS` for teams with `push`/`maintain`/`admin`. |
| `repo.topics`     | `string[]`                              | GitHub topics set on the repository.                                                                                                                                       |
| `repo.protection` | `"balanced" \| "strict" \| "none"`      | Branch-protection preset applied by `holocron setup`.                                                                                                                      |
| `repo.properties` | `RepoProperties`                        | Org-level custom property values synced to the GitHub dashboard.                                                                                                           |

### Skills installer

`holocron setup` can install shared skills from `@theholocron/skills` into the local repo:

```ts
export default defineConfig({
	agent: "claude", // "claude" | "codex" | "gemini"
	skills: ["git-safety", "pr-workflow"], // skill names from @theholocron/skills
	providers: { source: "github" },
});
```

Skills are copied to `.agents/skills/<name>/` and symlinked at the agent's expected path (e.g. `.claude/skills/<name>`). All installed paths are added to a managed block in `.gitignore` automatically.

<!-- prettier-ignore -->
```jsonc
{ "providers": { "source": "github" } }
```

Set `name` explicitly whenever the derived value would be wrong: content
repos without a `package.json` (e.g. `.github`) will fall back to the
directory basename, which may not match what your vault or deployment
provider expects as a project identifier.

### Shareable configs

**Level 1 — per-capability config packages.** Reference a published
package in any provider slot and Holocron resolves its bundled
`{ provider, options }` automatically. Per-project options merge on
top (project wins):

<!-- prettier-ignore -->
```ts
providers: {
  vault: '@acme/holocron-vault',                     // preset only
  source: ['@acme/holocron-github', { repo: 'x' }], // preset + override
}

```

A capability config package exports a `CapabilityConfigPackage` default:

<!-- prettier-ignore -->
```ts
import type { CapabilityConfigPackage } from "@theholocron/cli";
export default {
  provider: "1password",
  options: { vault: "acme-app" },
} satisfies CapabilityConfigPackage;

```

**Level 2 — whole-config presets.** Because the config file can be
JS/TS, a shared base is an import:

<!-- prettier-ignore -->
```ts
// holocron.config.ts
import { acmeConfig } from "@acme/holocron-config";
export default acmeConfig;

```

## Auth — fine-grained tokens

Each GitHub capability resolves its own fine-grained PAT so a compromised
credential only affects that feature. Store them once in the OS keyring
(macOS Keychain, Windows Credential Manager, libsecret on Linux):

```sh
holocron auth set github.read     ghp_xxx  # clone + CI run listing
holocron auth set github.issues   ghp_xxx  # issue management
holocron auth set github.sync     ghp_xxx  # sync-github workflow templates
holocron auth set github.release  ghp_xxx  # semantic-release
holocron auth set github.admin    ghp_xxx  # setup, secrets, environments
```

The resolution chain per capability is:

```
--token flag → HOLOCRON_<FEATURE>_TOKEN env var → keyring("github.<feature>")
```

See [`docs/tokens.md`](../../docs/tokens.md) for required PAT scopes per feature.

Additional `auth` subcommands:

```sh
holocron auth check github.read   # re-verify a stored token
holocron auth unset github.read   # remove a stored token
holocron auth list                # show all stored providers
```

## What's in here

- `src/capabilities/` — the 14 capability interfaces that providers
  implement
- `src/config.ts` — config schema, `defineConfig`, `resolveConfig`,
  `CapabilityConfigPackage`
- `src/load-config.ts` — `loadConfig` — reads JSON/JS/TS config files
- `src/define-config.ts` — `defineConfig` typed pass-through
- `src/loader.ts` — `PluginLoader` — dynamic-imports plugins, resolves
  capability config packages, builds the capability registry
- `src/cli.ts` — yargs entry, dispatches subcommands
- `src/commands/` — `setup`, `sync`, `doctor`, `deploy`, `secret set`,
  `secrets sync`, `npm publish-initial`, `sync-github`, `upgrade node`,
  `plugin create`, `auth`

## Status

Published on npm under the `alpha` dist-tag. APIs may still shift before
stable v2.0.0. Design in
[`.notes/archive/tech-architecture.spec.md`](../../.notes/archive/tech-architecture.spec.md).
