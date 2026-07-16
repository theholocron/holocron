---
status: draft # draft → proposed (issue filed) → approved (milestone attached) → archived
---

<!-- editorconfig-checker-disable-file -->

# Spec: Unified repo metadata config

## Problem

Repo metadata in `holocron.config.ts` is fragmented and incomplete:

- Branch protection is under `project.repoPolicy.preset` — a nested object that
  mixes the preset name with `requiredChecks`, making it awkward to read at a glance.
- GitHub custom properties (org dashboard filtering, ruleset targeting) have no
  config key at all — they were set once manually and have no ongoing sync.
- GitHub topics (public discoverability) have no config key — set manually per repo
  with no record in version control.
- The repo name (`project.repo`) is a bare string sitting alongside tooling config
  rather than being the root of a cohesive repo identity object.

## Proposed config shape

Introduce a `project.repo` object that replaces the bare string and consolidates
all GitHub repository metadata in one place:

```typescript
export default defineConfig({
  project: {
    name: "clients",
    description: "HTTP clients and API wrappers.",
    repo: {
      name: "theholocron/clients",      // replaces project.repo string
      protection: "strict",             // replaces repoPolicy.preset
      requiredChecks: [                 // moves from repoPolicy.requiredChecks
        "Lint / Lint entire codebase",
        "Test / Run tests and collect coverage",
        "Typecheck / tsc --noEmit",
      ],
      topics: ["api-client", "nodejs", "typescript"],
      properties: {
        lifecycle: "active",
        open_source: true,
        runtime_environment: "node",
        uses_external_packages: true,
      },
    },
    workflows: ["lint", "test", "typecheck", "codeql", "review", "release"],
  },
  providers: { ... },
});
```

`project.repoPolicy` is removed. `project.repo` is a string **or** the object
above — the string form remains valid for repos that only need the name.

## Config schema

```typescript
type RepoProtection = "balanced" | "strict" | "none";

interface RepoProperties {
	lifecycle?: "active" | "experimental" | "deprecated";
	open_source?: boolean;
	runtime_environment?: "node" | "browser" | "universal" | "none";
	uses_external_packages?: boolean;
}

interface RepoConfig {
	name: string;
	protection?: RepoProtection; // default: "balanced"
	requiredChecks?: string[]; // only meaningful when protection = "strict"
	topics?: string[];
	properties?: RepoProperties;
}

// project.repo: string | RepoConfig
```

## Custom properties

All properties are defined at the org level and set per-repo via
`PATCH /repos/{owner}/{repo}/properties/values`.

| Property                  | Type            | Values                                    | Source                                   |
| ------------------------- | --------------- | ----------------------------------------- | ---------------------------------------- |
| `branch_protection_level` | `single_select` | `balanced` / `strict` / `none`            | derived from `repo.protection`           |
| `lifecycle`               | `single_select` | `active` / `experimental` / `deprecated`  | `repo.properties.lifecycle`              |
| `monorepo`                | `true_false`    | —                                         | derived: `pnpm-workspace.yaml` present   |
| `open_source`             | `true_false`    | —                                         | `repo.properties.open_source`            |
| `runtime_environment`     | `single_select` | `node` / `browser` / `universal` / `none` | `repo.properties.runtime_environment`    |
| `uses_external_packages`  | `true_false`    | —                                         | `repo.properties.uses_external_packages` |

**Org schema already defined** (2026-07-15). Future additions:

```bash
gh api /orgs/theholocron/properties/schema -X PATCH --input - <<'EOF'
{ "properties": [ { "property_name": "...", "value_type": "...", ... } ] }
EOF
```

## Topics

`repo.topics` is the authoritative list for the repo. `syncTopics` calls
`PUT /repos/{owner}/{repo}/topics` with the full array — GitHub replaces the
topic set atomically, so the config is always the source of truth.

Topics are not auto-derived; they must be set explicitly. Conventions:

- Use lowercase, hyphen-separated slugs (`api-client`, not `apiClient`)
- Include runtime (`nodejs`, `browser`) when `runtime_environment` is set —
  this makes GitHub Explore useful even for users who don't know the org
- Include domain descriptors (`cli`, `config`, `api-client`, `developer-tools`)

## Derivation rules for custom properties

**`branch_protection_level`** — read from `repo.protection` (or `repoPolicy.preset`
during the migration window). Defaults to `balanced`.

**`monorepo`** — `true` when `pnpm-workspace.yaml` exists at the repo root.

**`lifecycle`**, **`open_source`**, **`runtime_environment`**,
**`uses_external_packages`** — read from `repo.properties`; not set if omitted.

## Implementation steps

**Step 1 — Update config schema in `packages/cli/src/config.ts`**

Replace `repoPolicy` with the `RepoConfig` union type above. Keep a migration
shim that reads `repoPolicy.preset` / `repoPolicy.requiredChecks` if `repo` is
still a string (backwards compat during rollout).

**Step 2 — Add `syncProperties` to `holocron-plugin-github`**

New file: `packages/holocron-plugin-github/src/capabilities/properties.ts`

```typescript
export async function syncProperties(rest: RestClient, repo: string, values: Record<string, string>): Promise<string>;
```

Calls `PATCH /repos/{owner}/{repo}/properties/values`. Returns `"N properties set"`.

**Step 3 — Add `syncTopics` to `holocron-plugin-github`**

New file: `packages/holocron-plugin-github/src/capabilities/topics.ts`

```typescript
export async function syncTopics(rest: RestClient, repo: string, topics: string[]): Promise<string>;
```

Calls `PUT /repos/{owner}/{repo}/topics`. Returns `"N topics set"`.

**Step 4 — Add optional `syncProperties?` and `syncTopics?` to `Source` interface**

Same pattern as `syncLabels?` in `capabilities/index.ts`.

**Step 5 — Call both from `runSetup`**

After the `sync labels` step:

```typescript
const repoConfig = typeof config.project.repo === "object" ? config.project.repo : {};
const properties: Record<string, string> = {};

// Derived
const preset = repoConfig.protection ?? config.project.repoPolicy?.preset ?? "balanced";
if (preset !== "none") properties["branch_protection_level"] = preset;

const isMonorepo = await fs
	.access("pnpm-workspace.yaml")
	.then(() => true)
	.catch(() => false);
properties["monorepo"] = String(isMonorepo);

// Manual
const manual = repoConfig.properties ?? {};
if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
if (manual.uses_external_packages !== undefined)
	properties["uses_external_packages"] = String(manual.uses_external_packages);

if (source.syncProperties) {
	steps.push(await runStep("source", "sync properties", dryRun, () => source.syncProperties!(properties)));
}

// Topics
const topics = repoConfig.topics ?? [];
if (topics.length > 0 && source.syncTopics) {
	steps.push(await runStep("source", "sync topics", dryRun, () => source.syncTopics!(topics)));
}
```

**Step 6 — Migrate all five `holocron.config.ts` files**

Replace `project.repo` string + `project.repoPolicy` with the new `project.repo`
object in each repo. Rely on the migration shim until all are updated.

**Step 7 — Remove `repoPolicy` from the config schema**

Once all repos are migrated, drop the shim and the `repoPolicy` type.

## Open questions

- Should `project.repo` string form be kept permanently, or deprecated once all
  repos use the object form? Keeping it avoids a hard migration deadline.
- Should `uses_external_packages` be auto-derived from `package.json` `files`
  or `publishConfig` rather than requiring manual config?
- Should the org schema definition be automated via a `holocron setup-org`
  command, or remain a one-time scripted step?
- Org ruleset targeting via custom properties requires GitHub Team+. See
  issue #142 for the migration plan once the org upgrades.
