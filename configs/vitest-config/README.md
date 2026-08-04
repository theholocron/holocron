# Vitest Config

A [Vitest configuration](https://vitest.dev/config/) with presets for Node.js libraries, React apps, and Storybook within the Galaxy.

## Installation

```bash
pnpm add -D @theholocron/vitest-config
```

## Usage

Presets are designed for use with Vitest's `projects` array, which runs unit and component tests in separate environments. Coverage is configured at the root `test` level and applies across all projects.

```typescript
import { coverage, react, storybook } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
	test: {
		coverage: {
			...coverage,
			exclude: [...coverage.exclude, "**/mocks/**"],
		},
		projects: [react({ name: "unit" }), await storybook(".storybook", { setupFiles: ["./vitest.setup.ts"] })],
	},
}));
```

### Node.js library or CLI tool

```typescript
import { node } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig(node());
```

### React component library or app

Requires `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom` as peer dependencies. The `react` preset automatically adds `@testing-library/jest-dom` to `setupFiles` — no manual import needed.

```typescript
import { react } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig(react());
```

### Storybook component tests

Requires `@storybook/addon-vitest` and `playwright` as peer dependencies.

```typescript
import { storybook } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig(await storybook(".storybook"));
```

## Coverage defaults

The `coverage` export provides standard coverage configuration (v8 provider, `text` + `lcov` reporters, vitest's default excludes). Extend it with project-specific excludes:

```typescript
import { coverage } from "@theholocron/vitest-config";

// in vitest.config.ts
coverage: {
  ...coverage,
  exclude: [...coverage.exclude, "**/handlers.*", "**/*.mock.*"],
}
```

## MSW setup helpers

Use `setupMSWBrowser` and `setupMSWNode` from `@theholocron/vitest-config/setup/msw` to wire MSW lifecycle hooks. Pass optional Storybook annotations to ensure `annotations.beforeAll` runs before the worker starts.

### Browser (Storybook / Playwright)

```typescript
// vitest.setup.ts
import { setProjectAnnotations } from "@storybook/react";
import { setupMSWBrowser } from "@theholocron/vitest-config/setup/msw";
import * as preview from "./.storybook/preview";
import { worker } from "./src/mocks/browser";

const annotations = setProjectAnnotations([preview]);
setupMSWBrowser(worker, annotations);
```

### Node (unit tests)

```typescript
// vitest.setup.ts
import { setupMSWNode } from "@theholocron/vitest-config/setup/msw";
import { server } from "./src/mocks/node";

setupMSWNode(server);
```

## Bundles

Bundles combine a preset with opinionated coverage settings (80% threshold on all metrics via `@vitest/coverage-v8`).

### Library bundle

```typescript
import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

export default defineConfig(library());
```

### React app bundle

```typescript
import { reactApp } from "@theholocron/vitest-config/bundles/react-app";
import { defineConfig } from "vitest/config";

export default defineConfig(reactApp());
```

## How We Test

We use [Vitest](https://vitest.dev/) as our testing framework with the following conventions:

- **Coverage**: enforced at 80% on lines, branches, functions, and statements via `@vitest/coverage-v8`
- **File naming**: test files use the `.test.{js,ts}` or `.spec.{js,ts}` suffix, co-located with source
- **Stories excluded**: `*.{story,stories}.*` files are excluded from unit test runs; use the `storybook` preset for those
