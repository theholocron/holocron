# Lighthouse Config

A [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) configuration with sensible defaults for auditing performance and accessibility within the Galaxy.

## Installation

```bash
pnpm add -D @theholocron/lighthouse-config
```

Install `@lhci/cli` to run audits:

```bash
pnpm add -D @lhci/cli
```

## Usage

Create a `lighthouse.config.js` at the project root and pass it to `lhci` with `--config`:

```javascript
import { defineConfig } from "@theholocron/lighthouse-config";

export default defineConfig({
  url: "http://localhost:5173/",
  startServerCommand: "pnpm dev",
});
```

Run with:

```bash
pnpm lhci autorun --config=./lighthouse.config.js
```

> **Note:** `@lhci/cli` does not support upward directory traversal for config discovery. Always pass `--config=./lighthouse.config.js` explicitly.

## Options

| Option               | Type                  | Default                      | Description                                       |
| -------------------- | --------------------- | ---------------------------- | ------------------------------------------------- |
| `url`                | `string \| string[]`  | —                            | URL(s) to audit                                   |
| `startServerCommand` | `string`              | —                            | Command to start the dev server before collecting |
| `assertions`         | `LighthouseAssertion` | `defaultAssertions`          | Audit thresholds                                  |
| `uploadTarget`       | `string`              | `"temporary-public-storage"` | Where to upload results                           |

## Default assertions

The `defaultAssertions` export contains the standard set of thresholds. All audit at `warn` level with a `minScore` of `0.9` (or `maxLength: 0` for byte-size audits):

- `bf-cache`, `errors-in-console`, `font-display`, `label`
- `largest-contentful-paint`, `lcp-lazy-loaded`
- `non-composited-animations`, `prioritize-lcp-image`
- `unused-javascript`, `uses-long-cache-ttl`

Override individual thresholds by spreading and replacing:

```javascript
import { defineConfig, defaultAssertions } from "@theholocron/lighthouse-config";

export default defineConfig({
  url: "http://localhost:5173/",
  startServerCommand: "pnpm dev",
  assertions: {
    ...defaultAssertions,
    "largest-contentful-paint": ["error", { minScore: 0.95 }],
  },
});
```
