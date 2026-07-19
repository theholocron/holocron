# Bundlewatch Config — Deprecated

> **This package is deprecated.** New projects should use Codecov bundle analysis
> via [`@theholocron/vite-config`](../vite-config) instead, which uploads bundle
> stats to Codecov automatically with no additional configuration.

## Migration

Install the peer dependency:

```bash
pnpm add -D @codecov/vite-plugin
```

All three `@theholocron/vite-config` presets (`library`, `reactApp`, `nodeApp`) automatically
include `@codecov/vite-plugin` when it is installed and `CODECOV_TOKEN` is set in the
environment — no changes to your `vite.config.ts` are needed.

Add the following to your `codecov.yml` to control when Codecov posts bundle size comments on PRs:

```yaml
comment:
  require_bundle_changes: true
  bundle_change_threshold: "1Kb"
```

See the [`@theholocron/vite-config` README](../vite-config/README.md) for full setup details.

## Legacy Installation

```bash
npm install --save-dev @theholocron/bundlewatch-config bundlewatch
```

## Legacy Usage

Create a `bundlewatch.config.js` at your project root:

```js
export { default } from "@theholocron/bundlewatch-config";
```

Add a script to `package.json`:

```json
{
  "scripts": {
    "audit:bundle": "bundlewatch --config bundlewatch.config.js"
  }
}
```
