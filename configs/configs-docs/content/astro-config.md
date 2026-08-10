---
title: Astro Config
description: Astro configuration factory for theholocron docs sites.
---

`@theholocron/astro-config` provides a `defineConfig` factory that generates a standard Astro + Starlight configuration for per-repo docs sites, deriving the base URL, title, social links, and sidebar from the repo's docs config package.

## Install

```bash
pnpm add -D @theholocron/astro-config
```

## Usage

```ts
// astro.config.ts
import { defineConfig } from "@theholocron/astro-config";
import clientsConfig from "@theholocron/clients-docs";

export default defineConfig({
  docs: clientsConfig,
  importMetaUrl: import.meta.url,
});
```

### Custom sidebar label

```ts
import { defineConfig } from "@theholocron/astro-config";
import holocronConfig from "@theholocron/holocron-docs";

export default defineConfig({
  docs: holocronConfig,
  importMetaUrl: import.meta.url,
  sidebarLabel: "Reference",
});
```
