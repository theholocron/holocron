---
title: Storybook Config
description: Shared Storybook main and preview configuration for theholocron component projects.
---

`@theholocron/storybook-config` exports ready-made Storybook `main` and `preview` configurations for component libraries in the theholocron ecosystem.

## Install

```bash
pnpm add -D @theholocron/storybook-config
```

## Usage

In `.storybook/main.ts`:

```ts
import { main } from "@theholocron/storybook-config";

export default main;
```

In `.storybook/preview.ts`:

```ts
import { preview } from "@theholocron/storybook-config";

export default preview;
```
