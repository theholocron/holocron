# @theholocron/docs-theme

Starlight plugin that injects the shared `@theholocron` docs CSS theme.

## Install

```sh
pnpm add @theholocron/docs-theme
```

## Usage

```ts
// astro.config.ts
import { docsTheme } from "@theholocron/docs-theme";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    starlight({
      plugins: [docsTheme()],
      title: "My Docs",
    }),
  ],
});
```

## Peer dependencies

| Package              | Version    |
| -------------------- | ---------- |
| `astro`              | `>=5.0.0`  |
| `@astrojs/starlight` | `>=0.30.0` |
