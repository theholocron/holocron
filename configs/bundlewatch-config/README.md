# Bundlewatch Config

A [bundlewatch configuration](https://bundlewatch.io/#/reference/configuration) for monitoring file size for libraries.

## Installation

```bash
npm install --save-dev @theholocron/bundlewatch-config
```

## Usage

In your project `package.json` add the following:

```json
{
  "scripts": {
    "audit:bundle": "bundlewatch --config ./node_modules/@theholocron/bundlewatch-config/index.js",
    "audit": "run-p audit:*"
  }
}
```

**Note**: `run-p` uses [`npm-run-all`](https://www.npmjs.com/package/npm-run-all) package to run tasks concurrently, but you could also use [`concurrently`](https://www.npmjs.com/package/concurrently).
