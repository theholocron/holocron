# @theholocron/github-client-docs

Documentation content package for [`@theholocron/github-client`](https://github.com/theholocron/clients/tree/main/packages/github-client).

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
import config from "@theholocron/github-client-docs";

console.log(config.slug); // "clients/github"
console.log(config.parent); // "clients"
console.log(config.sidebar); // sidebar tree for Starlight
```
