---
title: Vitest Config
description: Vitest configuration presets for libraries, React apps, and Storybook.
---

`@theholocron/vitest-config` provides Vitest configuration presets that cover the common testing environments used across theholocron projects.

## Install

```bash
npm i -D @theholocron/vitest-config vitest
```

## Presets

### `node`

For Node.js packages. Uses the `node` environment and emits coverage with v8.

```ts
// vitest.config.ts
import { node } from "@theholocron/vitest-config/presets/node";

export default node();
```

### `react`

For React component libraries. Uses `jsdom` environment and adds React Testing Library globals.

```ts
import { react } from "@theholocron/vitest-config/presets/react";

export default react();
```

### `storybook`

For Storybook interaction tests.

```ts
import { storybook } from "@theholocron/vitest-config/presets/storybook";

export default storybook();
```

## Bundles

### `library`

Pre-composed config for npm packages: `node` preset + coverage thresholds at 80%.

```ts
// vitest.config.ts
import { library } from "@theholocron/vitest-config/bundles/library";

export default library();
```
