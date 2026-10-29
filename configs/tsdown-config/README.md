# tsdown Config

Shared [tsdown](https://tsdown.dev) configurations for `@theholocron` packages.

## Installation

```bash
pnpm add -D @theholocron/tsdown-config tsdown
```

## Presets

### `library` — published ESM library

Single entry point (`src/index.ts`), generates `.d.ts` type declarations, does not bundle `@theholocron/*` peers.

After every successful build it also fails if an emitted `.js`/`.mjs`/`.cjs` file in `outDir` is over 500KB. That is the symptom of a dependency that failed to externalize (`deps.neverBundle` misconfigured, or a tsdown/rolldown regression), which inlines the whole tree ([holocron#762](https://github.com/theholocron/holocron/issues/762)). A caller's own `onSuccess` still runs, after the check.

```ts
// tsdown.config.ts
export { default } from "@theholocron/tsdown-config/presets/library";
```

To customise entry points or other options, use the `library()` factory:

```ts
// tsdown.config.ts
import { library } from "@theholocron/tsdown-config/presets/library";

export default library({
  entry: ["src/index.ts", "src/capabilities/index.ts"],
});
```

### `cli` — CLI binary

Single entry point (`src/cli.ts`), no type declarations (binaries don't need them), sourcemap enabled, injects `#!/usr/bin/env node` shebang so the output is directly executable.

```ts
// tsdown.config.ts
export { default } from "@theholocron/tsdown-config/presets/cli";
```

To customise the entry point or other options, use the `cli()` factory:

```ts
// tsdown.config.ts
import { cli } from "@theholocron/tsdown-config/presets/cli";

export default cli({
  entry: ["src/my-cli.ts"],
});
```

### `cli` — CLI binary

Single entry point (`src/cli.ts`), no type declarations (binaries don't need them), sourcemap enabled, injects `#!/usr/bin/env node` shebang so the output is directly executable.

```ts
// tsdown.config.ts
export { default } from "@theholocron/tsdown-config/presets/cli";
```

To customise the entry point or other options, use the `cli()` factory:

```ts
// tsdown.config.ts
import { cli } from "@theholocron/tsdown-config/presets/cli";

export default cli({
  entry: ["src/my-cli.ts"],
});
```
