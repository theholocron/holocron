# tsdown Config

Shared [tsdown](https://tsdown.dev) configurations for `@theholocron` packages.

## Installation

```bash
npm install --save-dev @theholocron/tsdown-config tsdown
```

## Usage

For a standard published ESM library (single entry, generates types, doesn't bundle `@theholocron/*` peers):

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
