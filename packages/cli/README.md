# `@theholocron/cli`

The Holocron CLI — a pluggable, capability-based orchestrator for
spinning up and operating software projects.

## Status

**v2 alpha.** The shape is being built up per
[`.notes/tech-architecture.spec.md`](../../.notes/tech-architecture.spec.md).
Most commands aren't wired yet.

## Concept

Each project declares a `holocron.config.json` that maps **capabilities**
(`sourceControl`, `ci`, `hosting`, `dataStore`, etc.) to **provider plugins**:

```jsonc
{
  "project": { "name": "my-app" },
  "providers": {
    "sourceControl": "github",
    "ci": "github",
    "issues": "github",
    "platformSecrets": "github",
    "hosting": ["vercel", { "team": "my-team" }],
    "dataStore": ["neon", { "kind": "postgres" }],
    "auth": "clerk",
    "envSecrets": "1password",
    "apiTooling": "postman"
  }
}
```

Plugin packages follow `@theholocron/holocron-plugin-<provider>` and
each exports the capability implementations it provides.

## Install

```bash
pnpm add -D @theholocron/cli
pnpm holocron --help
```
