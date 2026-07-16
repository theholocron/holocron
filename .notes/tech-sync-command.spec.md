---
status: draft # draft → proposed (issue filed) → approved (milestone attached) → archived
---

<!-- editorconfig-checker-disable-file -->

# Spec: `holocron sync` command

## Problem

`holocron setup` is an all-or-nothing bootstrap command. It applies security
toggles, branch protection rulesets, workflow files, and source sync steps
(labels, topics, properties) in one shot. Running it to push a topic or label
change is heavy — it re-applies every protection rule and rewrites every
generated file, which is slow, noisy, and risky in a repo that's already set
up.

There's no lightweight path for ongoing maintenance of source-level state. As
a result, operators either run full setup (over-broad) or bypass the CLI and
call the GitHub API directly (out-of-band, config diverges).

## Proposed command

```
holocron sync [step...]         # sync one or more named steps
holocron sync                   # sync all available steps
```

Named steps map 1:1 to optional `Source` methods:

| Step         | Source method     | API call                                        |
| ------------ | ----------------- | ----------------------------------------------- |
| `labels`     | `syncLabels?`     | GET + POST/PATCH/DELETE `/repos/{o}/{n}/labels` |
| `properties` | `syncProperties?` | PATCH `/repos/{o}/{n}/properties/values`        |
| `topics`     | `syncTopics?`     | PUT `/repos/{o}/{n}/topics`                     |

`holocron sync` with no step arguments runs all three in the order above.
Unknown step names are reported as `skip` (same pattern as unknown workflows
in `setup`).

## Design

### Entry point

New top-level command `sync` alongside `setup`, `doctor`, etc. Registered in
`packages/cli/src/commands/index.ts` (or equivalent entry file).

### Flags

| Flag        | Description                                      |
| ----------- | ------------------------------------------------ |
| `--dry-run` | Print what would be synced without calling APIs. |
| `--repo`    | Override `project.repo.name` (same as setup).    |
| `--token`   | Override auth token (same as setup).             |

### Output format

Reuses the same `runStep` / `formatStep` / `SetupReport` machinery from
`setup.ts` so output is consistent:

```
Holocron sync — configs
  config: /path/to/holocron.config.ts

  → source
  ✓ source  sync labels          3 created, 0 updated, 0 deleted
  ✓ source  sync properties      5 properties set
  ✓ source  sync topics          16 topics set

  2 ok, 0 fail, 0 skip, 0 dry-run
```

### Relationship to setup

`setup` keeps its existing behaviour unchanged. The sync steps it currently
runs (after labels) can optionally be extracted into a shared helper so both
commands call the same logic without duplication, but that's an internal
refactor — the external contract of `setup` is unaffected.

## Implementation steps

**Step 1 — Add `runSync` function in `packages/cli/src/commands/sync.ts`**

Mirror the structure of `runSetup`:

- Accept `RunSyncInput` (same shape as `RunSetupInput`, plus optional
  `steps?: string[]` to filter which syncs to run)
- Load the source plugin
- Call `syncLabels`, `syncProperties`, `syncTopics` in order when the
  provider implements them and the step is not filtered out
- Return a `SetupReport` (reuse existing type)

```typescript
export interface RunSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	steps?: string[]; // undefined = all; [] = none; ["topics"] = topics only
	loader?: PluginLoader;
	print?: SetupPrintLine;
}
```

**Step 2 — Wire the CLI entrypoint**

Register `sync [steps...]` in the command router. Pass positional args as
`steps` to `runSync`.

**Step 3 — Tests**

- `sync.test.ts`: covers all-steps run, single-step filter, unknown step skip,
  dry-run, and provider-does-not-implement skip.

## Open questions

- Should `sync` also accept `--step topics,labels` (comma-separated flag) in
  addition to positional args? Positional is simpler for shell scripting;
  a flag is easier to compose in CI `run:` blocks.
- Should `sync` eventually cover non-source capabilities (e.g. syncing vault
  secrets, tooling integrations)? Start source-only; extend later if the
  pattern proves useful.
- Should `setup` delegate its sync steps to `runSync` internally to avoid
  duplication, or keep them inline for explicitness?
