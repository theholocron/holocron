# `@theholocron/cli`

The Holocron CLI — a pluggable, capability-based orchestrator for
spinning up and operating software projects.

## Install

```bash
npm i -g @theholocron/cli@alpha
holocron --help
```

## What's in here

- `src/capabilities/` — the 14 capability interfaces that providers
	implement
- `src/config.ts` — `holocron.config.json` parser + plugin resolution
- `src/cli.ts` — yargs entry, dispatches subcommands
- `src/commands/` — `setup`, `doctor`, `deploy`, `secret set`,
	`secrets sync`, `npm publish-initial`

## Status

**`v2.0.0-alpha.0`** — published on npm under the `alpha` dist-tag.
[Release notes](https://github.com/theholocron/holocron/releases/tag/v2.0.0-alpha.0).
Design in
[`.notes/tech-architecture.spec.md`](../../.notes/tech-architecture.spec.md).
APIs may still shift before stable v2.0.0.
