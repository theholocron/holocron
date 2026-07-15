# Jest Config — Deprecated

> **This package is deprecated.** New projects should use
> [`@theholocron/vitest-config`](../vitest-config) instead.
> Vitest is faster, has native ESM support, and is the standard across all
> theholocron projects going forward.

A [Jest preset](https://jestjs.io/docs/configuration#preset-string) for testing JavaScript projects.

## Migration

Replace your Jest setup with Vitest:

```bash
npm uninstall @theholocron/jest-config jest
npm install --save-dev @theholocron/vitest-config vitest @vitest/coverage-v8
```

Update your config file from `jest.config.js` to `vitest.config.js`:

```javascript
import { defineConfig } from "vitest/config";
import { node } from "@theholocron/vitest-config/node";

export default defineConfig({ test: node().test });
```

See [`@theholocron/vitest-config`](../vitest-config) for all available presets.

## Legacy Installation

```bash
npm install --save-dev @theholocron/jest-config
```

## Legacy Usage

In your project `package.json`:

```json
{
  "jest": {
    "displayName": "<project>",
    "preset": "@theholocron/jest-config"
  }
}
```
