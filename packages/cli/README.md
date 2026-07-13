# `@theholocron/cli`

The Holocron CLI — a pluggable, capability-based orchestrator for
spinning up and operating software projects.

## Install

```bash
npm i -g @theholocron/cli@alpha
holocron --help
```

## Config file

Holocron reads `holocron.config.{json,js,ts}` from the project root
(priority: json → js → ts).

**JSON** (simplest):
```jsonc
// holocron.config.json
{
	"project": { "name": "my-app" },
	"providers": {
		"vault": ["1password", { "vault": "my-app" }],
		"source": "github"
	}
}
```

**JS/TS** — use `defineConfig` for autocomplete and type-checking:
```ts
// holocron.config.ts
import { defineConfig } from '@theholocron/cli'

export default defineConfig({
	project: { name: 'my-app' },
	providers: {
		vault: ['1password', { vault: 'my-app' }],
		source: 'github',
	},
})
```

### Shareable configs

**Level 1 — per-capability config packages.** Reference a published
package in any provider slot and Holocron resolves its bundled
`{ provider, options }` automatically. Per-project options merge on
top (project wins):

```ts
providers: {
	vault: '@acme/holocron-vault',                     // preset only
	source: ['@acme/holocron-github', { repo: 'x' }], // preset + override
}
```

A capability config package exports a `CapabilityConfigPackage` default:
```ts
import type { CapabilityConfigPackage } from '@theholocron/cli'
export default {
	provider: '1password',
	options: { vault: 'acme-app' },
} satisfies CapabilityConfigPackage
```

**Level 2 — whole-config presets.** Because the config file can be
JS/TS, a shared base is just an import:

```ts
// holocron.config.ts
import { acmeConfig } from '@acme/holocron-config'
export default acmeConfig
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
- `src/commands/` — `setup`, `doctor`, `deploy`, `secret set`,
	`secrets sync`, `npm publish-initial`

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
Design in
[`.notes/tech-architecture.spec.md`](../../.notes/tech-architecture.spec.md).
APIs may still shift before stable v2.0.0.
