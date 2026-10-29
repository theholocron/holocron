---
title: Astro Config
description: Astro + Starlight configuration factory for theholocron per-repo docs sites.
---

`@theholocron/astro-config` provides a `defineConfig` factory that wires up a standard Astro + Starlight configuration for per-repo docs sites, including base path, title, GitHub social link, sidebar, and the shared `docsTheme` plugin.

## Install

```bash
pnpm add -D @theholocron/astro-config @astrojs/starlight @theholocron/docs-theme
```

## Usage

```ts
// astro.config.ts
import starlight from "@astrojs/starlight";
import { defineConfig } from "@theholocron/astro-config";
import { docsTheme } from "@theholocron/docs-theme";

export default defineConfig({
  docs: {
    name: "My Package",
    github: "my-repo",
    sidebar: [
      { label: "Overview", slug: "" },
      {
        label: "Packages",
        items: [{ label: "Something", slug: "something" }],
      },
    ],
  },
  starlight,
  docsTheme,
  srcDir: "./docs/src",
  outDir: "./docs/dist",
  publicDir: "./docs/public",
});
```

## Options

| Option      | Required | Description                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------- |
| `docs`      | Yes      | Site metadata — `name`, `github` slug, and `sidebar` config                           |
| `starlight` | Yes      | The `starlight` integration import from `@astrojs/starlight`                          |
| `docsTheme` | Yes      | The `docsTheme` export from `@theholocron/docs-theme`                                 |
| `srcDir`    | No       | Astro `srcDir` — use when `astro.config.ts` lives at the repo root, e.g. `./docs/src` |
| `outDir`    | No       | Astro `outDir`, e.g. `./docs/dist`                                                    |
| `publicDir` | No       | Astro `publicDir`, e.g. `./docs/public`                                               |
| `base`      | No       | URL base path. Defaults to `/${docs.github}` for GitHub Pages subpath deployment      |

## Exports

| Export            | Description                          |
| ----------------- | ------------------------------------ |
| `defineConfig`    | Factory that returns an Astro config |
| `DocsConfig`      | Type for the `docs` field            |
| `DocsConfigInput` | Full options type for `defineConfig` |
