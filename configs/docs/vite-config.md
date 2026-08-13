---
title: Vite Config
description: Vite configuration presets for libraries, React apps, and Node tools.
---

`@theholocron/vite-config` provides Vite configuration presets for the common project types used in the theholocron ecosystem.

## Install

```bash
pnpm add -D @theholocron/vite-config vite
```

## Presets

### `library`

For npm packages that ship a `dist/`. Configures Vite in library mode.

```ts
// vite.config.ts
import { library } from "@theholocron/vite-config";

export default library;
```
