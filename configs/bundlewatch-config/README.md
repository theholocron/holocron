# Bundlewatch Config

A [Bundlewatch configuration](https://bundlewatch.io/#/reference/configuration) for monitoring bundle size in libraries.

## Installation

```bash
npm install --save-dev @theholocron/bundlewatch-config bundlewatch
```

## Usage

Create a `bundlewatch.config.js` at your project root that re-exports the shared config:

```js
export { default } from "@theholocron/bundlewatch-config";
```

Then add a script to `package.json`:

```json
{
  "scripts": {
    "audit:bundle": "bundlewatch --config bundlewatch.config.js"
  }
}
```

Run it with:

```bash
pnpm run audit:bundle
```
