<!-- editorconfig-checker-disable-file -->

# Bundlewatch Config

A [Bundlewatch configuration](https://bundlewatch.io/#/reference/configuration) for monitoring bundle size in libraries.

## Installation

```bash
npm install --save-dev @theholocron/bundlewatch-config bundlewatch
```

## Usage

Add the following script to your project `package.json`:

```json
{
	"scripts": {
		"audit:bundle": "bundlewatch --config ./node_modules/@theholocron/bundlewatch-config/bundlewatch.config.js"
	}
}
```

Then run:

```bash
npm run audit:bundle
```
