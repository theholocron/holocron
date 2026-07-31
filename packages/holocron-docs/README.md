# @theholocron/holocron-docs

Documentation content package for [`@theholocron/holocron`](https://github.com/theholocron/holocron) — the pluggable capability-based CLI for spinning up and operating software projects.

This package publishes Markdown content and a `DocsConfig` object consumed by the
[`theholocron.github.io`](https://github.com/theholocron/theholocron.github.io) aggregator site
and any per-repo Starlight shell that links it via `workspace:*`.

## Structure

```
content/             Markdown pages
  commands/          One page per CLI command
  plugins/           One page per plugin
dist/                Compiled DocsConfig (generated — do not edit)
src/index.ts         DocsConfig source
```

## Usage

```ts
import config from "@theholocron/holocron-docs";

console.log(config.slug);    // "holocron"
console.log(config.sidebar); // sidebar tree for Starlight
```
