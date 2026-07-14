# Vite Config

A [Vite configuration](https://vite.dev/config/) with presets for libraries, React apps, and Node.js tools within the Galaxy.

## Installation

```bash
npm install --save-dev @theholocron/vite-config
```

## Usage

Pick the preset that matches your project type. All presets accept an `overrides` object that is deep-merged last via `mergeConfig`.

### Publishable library

Outputs ESM only; externalises `react` and `react-dom` by default. Returns a `Promise` because the plugin is loaded dynamically.

```javascript
import { defineConfig } from "vite";
import { library } from "@theholocron/vite-config/library";

export default defineConfig(
	await library({ entry: "src/index.ts", name: "MyLib" }),
);
```

### React single-page application

Requires `@vitejs/plugin-react` as a peer dependency. Returns a `Promise` because the plugin is loaded dynamically.

```javascript
import { defineConfig } from "vite";
import { reactApp } from "@theholocron/vite-config/react-app";

export default defineConfig(await reactApp());
```

Pass `vite-tsconfig-paths` via `overrides.plugins` to enable tsconfig path aliases:

```javascript
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { reactApp } from "@theholocron/vite-config/react-app";

export default defineConfig(await reactApp({ plugins: [tsconfigPaths()] }));
```

### Node.js CLI tool or server app

Targets Node 22; outputs a single ESM bundle with no browser polyfills. Returns a `Promise` because the plugin is loaded dynamically.

```javascript
import { defineConfig } from "vite";
import { nodeApp } from "@theholocron/vite-config/node-app";

export default defineConfig(await nodeApp({ entry: "src/index.ts" }));
```
