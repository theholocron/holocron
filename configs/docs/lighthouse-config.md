---
title: Lighthouse Config
description: Shared Lighthouse CI assertion config for theholocron projects.
---

`@theholocron/lighthouse-config` provides a shared [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) assertion configuration used across theholocron front-end projects.

## Install

```bash
pnpm add -D @theholocron/lighthouse-config
```

## Usage

In your `lighthouserc.cjs`:

```js
const { defaultAssertions, defineConfig } = require("@theholocron/lighthouse-config");

module.exports = defineConfig({
  url: "http://localhost:4321",
  startServerCommand: "pnpm preview",
  assertions: {
    ...defaultAssertions,
    // override individual assertions as needed
    "largest-contentful-paint": ["error", { minScore: 0.8 }],
  },
});
```

## Exports

| Export                    | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `defineConfig`            | Factory that produces a typed `lighthouserc` config object              |
| `defaultAssertions`       | Pre-set assertion thresholds covering core Web Vitals and common audits |
| `LighthouseAssertion`     | Type for the `assertions` map                                           |
| `LighthouseConfigOptions` | Options type for `defineConfig`                                         |

## Default assertions

The bundled `defaultAssertions` warn on the following audits falling below `0.9` (or exceeding `0` bytes where applicable):

`bf-cache`, `errors-in-console`, `font-display`, `label`, `largest-contentful-paint`, `lcp-lazy-loaded`, `non-composited-animations`, `prioritize-lcp-image`, `unused-javascript`, `uses-long-cache-ttl`
