# Vitest Config

A [Vitest configuration](https://vitest.dev/config/) with presets for Node.js libraries, React apps, and Storybook within the Galaxy.

## Installation

```bash
npm install --save-dev @theholocron/vitest-config
```

## Usage

Pick the preset that matches your project type. Presets return a `UserProjectConfig` object for use in `vitest.config.js`.

### Node.js library or CLI tool

```javascript
import { defineConfig } from "vitest/config";
import { node } from "@theholocron/vitest-config/node";

export default defineConfig({ test: node().test });
```

### React component library or app

Requires `jsdom` and `@testing-library/react` as peer dependencies.

```javascript
import { defineConfig } from "vitest/config";
import { react } from "@theholocron/vitest-config/react";

export default defineConfig({ test: react().test });
```

### Storybook component tests

Requires `@storybook/addon-vitest` and `playwright` as peer dependencies.

```javascript
import { defineConfig } from "vitest/config";
import { storybook } from "@theholocron/vitest-config/storybook";

export default defineConfig(await storybook(".storybook"));
```

## Bundles

Bundles combine a preset with opinionated coverage settings (80% threshold on all metrics via `@vitest/coverage-v8`).

### Library bundle

```javascript
import { defineConfig } from "vitest/config";
import { library } from "@theholocron/vitest-config/bundles/library";

export default defineConfig({ test: library().test });
```

### React app bundle

```javascript
import { defineConfig } from "vitest/config";
import { reactApp } from "@theholocron/vitest-config/bundles/react-app";

export default defineConfig({ test: reactApp().test });
```

## How We Test

We use [Vitest](https://vitest.dev/) as our testing framework with the following conventions:

-   **Coverage**: enforced at 80% on lines, branches, functions, and statements via `@vitest/coverage-v8`
-   **File naming**: test files use the `.test.{js,ts}` or `.spec.{js,ts}` suffix, co-located with source
-   **Stories excluded**: `*.{story,stories}.*` files are excluded from unit test runs; use the `storybook` preset for those
