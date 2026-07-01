# `@theholocron/cli`

The Holocron CLI — a pluggable, capability-based orchestrator for
spinning up and operating software projects.

## Status

**v2 alpha.** The shape is being built up per
[`.notes/tech-architecture.spec.md`](../../.notes/tech-architecture.spec.md).
Most commands aren't wired yet.

## What's in here

- `src/capabilities/` — the 14 capability interfaces that providers
	implement
- `src/config.ts` — `holocron.config.json` parser + plugin resolution
- `src/cli.ts` — yargs entry, dispatches subcommands (WIP)

## Install (when published)

```bash
pnpm add -D @theholocron/cli
pnpm holocron --help
```
