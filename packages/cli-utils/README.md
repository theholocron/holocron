# `@theholocron/cli-utils`

Shared CLI primitives carried over from the v1 single-package CLI:

- `ui/` — prompts wrappers (`@inquirer/prompts` for autocomplete /
  confirm / input / search / select), browser + editor openers
- `tasks/` — find + replace helpers for file operations
- `utils/` — shell `$`, config, env loading, logging (winston), node
  helpers

Consumed by `@theholocron/cli` and (eventually) every plugin under
`packages/holocron-plugin-*`.

> **Status:** v2 WIP — the surface here is the v1 code lifted into the
> monorepo unchanged so we keep git history. Expect renames and
> trimming as v2 capability work lands.
