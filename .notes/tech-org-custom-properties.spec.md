---
status: draft # draft → proposed (issue filed) → approved (milestone attached) → archived
---

<!-- editorconfig-checker-disable-file -->

# Spec: Org-level custom properties

## Problem

GitHub org custom properties are unused. Without them:

- There is no machine-readable way to query "all repos that publish to npm" or
  "all repos with strict branch protection" — the org dashboard shows a flat
  undifferentiated list.
- Rulesets cannot be scoped to a subset of repos (e.g. enforce extra rules only
  on public/open-source repos) without hard-coding repo names.
- `holocron setup` applies the same policy everywhere; there is no per-repo
  signal it can read to vary behaviour without duplicating that signal in both
  `holocron.config.ts` and a separate data store.

## Proposed property set

All properties are defined at the org level and set per-repo. Types follow the
GitHub custom properties API (`string`, `single_select`, `true_false`,
`multi_select`).

| Property                  | Type            | Values                                    | Source                                 |
| ------------------------- | --------------- | ----------------------------------------- | -------------------------------------- |
| `branch_protection_level` | `single_select` | `balanced` / `strict` / `none`            | derived from `repoPolicy.preset`       |
| `lifecycle`               | `single_select` | `active` / `experimental` / `deprecated`  | manual in `holocron.config.ts`         |
| `monorepo`                | `true_false`    | —                                         | derived: `pnpm-workspace.yaml` present |
| `open_source`             | `true_false`    | —                                         | manual in `holocron.config.ts`         |
| `runtime_environment`     | `single_select` | `node` / `browser` / `universal` / `none` | manual in `holocron.config.ts`         |
| `uses_external_packages`  | `true_false`    | —                                         | manual in `holocron.config.ts`         |

### Derivation rules

**`branch_protection_level`** — read directly from `config.project.repoPolicy.preset`.
Defaults to `balanced` when `repoPolicy` is omitted. No config key needed.

**`monorepo`** — `true` when a `pnpm-workspace.yaml` (with a `packages:` key)
exists in the repo root at setup time. Detectable without any config change.

**`lifecycle`**, **`open_source`**, **`runtime_environment`**, **`uses_external_packages`** —
cannot be reliably derived; require opt-in in `holocron.config.ts`:

```typescript
project: {
  // ...
  properties: {
    lifecycle: "active",
    open_source: true,
    runtime_environment: "node",
    uses_external_packages: true,
  },
}
```

Repos that omit `properties` get only the two derived properties set.

## Why these properties

- **`branch_protection_level`** — enables ruleset targeting: e.g. require signed
  commits only on repos with `strict`, or block direct pushes to `main` only
  where this is set. Already derivable from config with no new input.
- **`monorepo`** — affects how tooling (audit, test, release) is configured;
  useful for filtering in the dashboard and for future `holocron` commands that
  behave differently in a workspace context.
- **`open_source`** — the most policy-relevant property: open-source repos may
  need stronger CodeQL, SECURITY.md enforcement, or CLA checks. Drives ruleset
  scoping without hard-coding repo names.
- **`runtime_environment`** — useful for filtering ("show me all Node repos")
  and for future tooling that needs to know whether a repo targets the browser
  (e.g. bundle size audits are only relevant for browser/universal).
- **`lifecycle`** — captures development status independently of GitHub's archive
  feature (a repo can be `deprecated` but still readable/forkable without being
  archived). Drives stale thresholds, access decisions, and dashboard filtering.
  Future: ruleset scoping could relax required checks on `deprecated` repos.
- **`uses_external_packages`** — flags repos that publish to npm; relevant for
  Trusted Publishing config, release workflow validation, and audit workflows.

## API

GitHub exposes custom properties via:

- `PUT /orgs/{org}/properties/schema` — define/update org-level property
  definitions (name, type, allowed values, default value, required)
- `PATCH /repos/{owner}/{repo}/properties/values` — set values on a specific repo
- `GET /repos/{owner}/{repo}/properties/values` — read current values

Setting values requires `org:write` or `admin:org` scope — the same token
`holocron setup` already uses for other org-level operations.

## Implementation approach

### Step 1 — Define properties in the CLI schema

Add an optional `properties` key to the project config schema in
`packages/cli/src/config.ts`:

```typescript
interface ProjectProperties {
	lifecycle?: "active" | "experimental" | "deprecated";
	open_source?: boolean;
	runtime_environment?: "node" | "browser" | "universal" | "none";
	uses_external_packages?: boolean;
}
```

### Step 2 — Add `syncProperties` to `holocron-plugin-github`

New file: `packages/holocron-plugin-github/src/capabilities/properties.ts`

```typescript
export async function syncProperties(rest: RestClient, repo: string, values: Record<string, string>): Promise<string>;
```

Calls `PATCH /repos/{owner}/{repo}/properties/values` with the resolved set.
Returns a summary string (e.g. `"5 properties set"`).

### Step 3 — Add optional `syncProperties` to `Source` interface

Same pattern as `syncLabels?` on `Source` in `capabilities/index.ts`.

### Step 4 — Call from `runSetup`

After the `sync labels` step, resolve the full property map:

```typescript
const properties: Record<string, string> = {};

// Derived
const preset = config.project.repoPolicy?.preset ?? "balanced";
if (preset !== "none") properties["branch_protection_level"] = preset;

const isMonorepo = await fs
	.access("pnpm-workspace.yaml")
	.then(() => true)
	.catch(() => false);
properties["monorepo"] = String(isMonorepo);

// Manual
const manual = config.project.properties ?? {};
if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
if (manual.uses_external_packages !== undefined)
	properties["uses_external_packages"] = String(manual.uses_external_packages);

if (source.syncProperties) {
	steps.push(await runStep("source", "sync properties", dryRun, () => source.syncProperties!(properties)));
}
```

### Step 5 — One-time: define the org schema

Before any repo can have properties set, the org schema must declare them.
This can be done via the GitHub API (unlike org default labels, which are UI-only).
Note: the API rejects `default_value` on all property types — leave it out.

**Already completed** (2026-07-15) via:

```bash
gh api /orgs/theholocron/properties/schema -X PATCH --input - <<'EOF'
{
  "properties": [
    {"property_name":"branch_protection_level","value_type":"single_select","required":false,"description":"Branch protection preset applied by holocron setup","allowed_values":["balanced","strict","none"]},
    {"property_name":"lifecycle","value_type":"single_select","required":false,"description":"Development status of the repo","allowed_values":["active","experimental","deprecated"]},
    {"property_name":"monorepo","value_type":"true_false","required":false,"description":"Whether the repo is a pnpm workspace monorepo"},
    {"property_name":"open_source","value_type":"true_false","required":false,"description":"Whether the repo is publicly licensed and open to external contributors"},
    {"property_name":"runtime_environment","value_type":"single_select","required":false,"description":"Target runtime for the repo's primary artifact","allowed_values":["node","browser","universal","none"]},
    {"property_name":"uses_external_packages","value_type":"true_false","required":false,"description":"Whether the repo publishes packages to npm"}
  ]
}
EOF
```

Future additions use the same `PATCH` call (idempotent — upserts by name).

### Step 6 — Run `holocron setup` across repos

Same one-time migration as label sync: run setup in each of the five repos
to populate the properties. Then routine `holocron setup` runs keep them current.

## Open questions

- Should `monorepo` detection look for `pnpm-workspace.yaml` specifically, or
  any workspace file (`lerna.json`, `turbo.json`)? Currently the org is
  pnpm-only so `pnpm-workspace.yaml` is sufficient.
- Should `uses_external_packages` be auto-derived from whether `package.json`
  has a `publishConfig` or `files` field, rather than requiring manual config?
- Should the org schema definition (Step 5) be automated — e.g. a
  `holocron setup-org` command that runs once per org — or left as a
  one-time manual/scripted step?
- Ruleset targeting via custom properties requires GitHub Team+ on private repos.
  Document this limitation or gate the feature on plan detection.
