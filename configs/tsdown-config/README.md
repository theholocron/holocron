# tsdown Config

Shared [tsdown](https://tsdown.dev) configurations for `@theholocron` packages.

## Installation

```bash
pnpm add -D @theholocron/tsdown-config tsdown
```

## Presets

### `library` — published ESM library

Single entry point (`src/index.ts`), generates `.d.ts` type declarations, does not bundle `@theholocron/*` peers.

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
