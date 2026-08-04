# Vite Config

A [Vite configuration](https://vite.dev/config/) with presets for libraries, React apps, and Node.js tools within the Galaxy.

## Installation

```bash
pnpm add -D @theholocron/vite-config
```

## Usage

Pick the preset that matches your project type. All presets accept an `overrides` object that is deep-merged last via `mergeConfig`.

### React component library

Outputs ESM + CJS; externalises `react` and `react-dom`; wires up `@vitejs/plugin-react`; sets `@` as an alias for `src/`. Returns a `Promise` because plugins are loaded dynamically.

```typescript
import { reactLibrary } from "@theholocron/vite-config/react-library";

export default reactLibrary({ name: "my-lib" });
```

Pass `overrides` to add project-specific config:

```typescript
import { reactLibrary } from "@theholocron/vite-config/react-library";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

export default reactLibrary({
	name: "my-lib",
	overrides: {
		plugins: [storybookTest()],
	},
});
```

### Publishable library (non-React)

Outputs ESM only; externalises `react` and `react-dom` by default. Returns a `Promise` because the plugin is loaded dynamically.

```typescript
import { library } from "@theholocron/vite-config/library";

export default library({ entry: "src/index.ts", name: "MyLib" });
```

### React single-page application

Requires `@vitejs/plugin-react` as a peer dependency. Returns a `Promise` because the plugin is loaded dynamically.

```typescript
import { reactApp } from "@theholocron/vite-config/react-app";

export default reactApp();
```

Pass `vite-tsconfig-paths` via `overrides.plugins` to enable tsconfig path aliases:

```typescript
import tsconfigPaths from "vite-tsconfig-paths";
import { reactApp } from "@theholocron/vite-config/react-app";

export default reactApp({ plugins: [tsconfigPaths()] });
```

### Node.js CLI tool or server app

Targets Node 22; outputs a single ESM bundle with no browser polyfills. Returns a `Promise` because the plugin is loaded dynamically.

```typescript
import { nodeApp } from "@theholocron/vite-config/node-app";

export default nodeApp({ entry: "src/index.ts" });
```

## Codecov bundle analysis

All presets automatically include [`@codecov/vite-plugin`](https://www.npmjs.com/package/@codecov/vite-plugin) when `@codecov/vite-plugin` is installed and `CODECOV_TOKEN` is set in the environment. No extra configuration in `vite.config.ts` is needed — bundle stats are uploaded to Codecov on every build.

Install the peer dependency:

```bash
pnpm add -D @codecov/vite-plugin
```

Set `CODECOV_TOKEN` as a CI secret, then add the following to your `codecov.yml` to control when Codecov posts bundle size comments on PRs:

```yaml
comment:
    require_bundle_changes: true
    bundle_change_threshold: "1Kb"
```

This posts a comment only when bundle size changes by more than 1 KB — enough to flag meaningful regressions without noise from routine fluctuations. See the [Codecov bundle analysis docs](https://docs.codecov.com/docs/javascript-bundle-analysis) for more threshold options.
