# createHeader

Factory that binds `source` and `tool` once and returns header constructors for auto-generated files.

```ts
const { workflowHeader, scaffoldHeader } = createHeader({
  source: "packages/cli/src/commands/setup/templates/editorconfig/create-config.ts",
});
```

## Headers

| Function | When to use | User can edit? |
|---|---|---|
| `workflowHeader()` | Files overwritten on every `holocron setup` / `sync-github` run | No — "AUTO-GENERATED — do not edit" |
| `scaffoldHeader()` | Files written once; user takes ownership after first run | Yes — "Scaffolded — edit this file freely" |

## `workflowHeader` formats

| Format | Comment style | Used for |
|---|---|---|
| `"yaml"` (default) | `# …` lines | YAML workflows, ignore files, `.editorconfig`, labeler config |
| `"cjs"` | `/* … */` block | CommonJS config files (`.cjs`) |
| `"shebang"` | `#!/bin/sh` + yaml `#` lines | Shell scripts (`prepare-commit-msg`, hooks) |

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `string` | required | Path within `theholocron/holocron` that owns the template |
| `tool` | `string` | `"holocron setup"` | CLI command that produces the file |
| `forPrimary` | `boolean` | `false` | Set `true` only when writing to `theholocron/.github` itself |
