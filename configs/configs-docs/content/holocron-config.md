---
title: Holocron Config
description: Shareable Holocron CLI configuration presets for theholocron repositories.
---

`@theholocron/holocron-config` provides shareable configuration presets for the [Holocron CLI](https://github.com/theholocron/holocron). It is consumed internally by `holocron setup` to generate consistent tooling configs across all theholocron repositories.

## Install

```bash
pnpm add -D @theholocron/holocron-config
```

## Usage

In `holocron.config.ts`:

```ts
import { defineConfig } from "@theholocron/holocron-config";

export default defineConfig({
	// your overrides
});
```

The CLI reads this file to determine which workflows to sync, which skills to install, and how to configure repo-level tooling.
