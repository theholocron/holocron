# @theholocron/configs-docs

Documentation content package for the [`@theholocron/configs`](https://github.com/theholocron/configs) monorepo.

This package publishes Markdown content and a `DocsConfig` object consumed by the
[`theholocron.github.io`](https://github.com/theholocron/theholocron.github.io) aggregator site
and any per-repo Starlight shell that links it via `workspace:*`.

## Structure

```
content/        Markdown pages
dist/           Compiled DocsConfig (generated — do not edit)
src/index.ts    DocsConfig source
```

## Usage

```ts
import config from "@theholocron/configs-docs";

console.log(config.slug); // "configs"
console.log(config.sidebar); // sidebar tree for Starlight
```
