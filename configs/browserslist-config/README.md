# Browserslist Config

A [browserslist configuration](https://github.com/browserslist/browserslist#shareable-configs) defining the browsers and devices supported by theholocron projects.

## Installation

```bash
npm install --save-dev @theholocron/browserslist-config
```

## Usage

In your project `package.json`:

```json
{
  "browserslist": ["extends @theholocron/browserslist-config"]
}
```

## Targets

This config targets modern browsers: the last 2 versions of major browsers,
plus any browser with more than 0.5% global usage, excluding dead browsers and
IE 11. See the [browserslist docs](https://github.com/browserslist/browserslist)
for query syntax.
