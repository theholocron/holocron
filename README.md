# Holocron

A pluggable, capability-based CLI for spinning up and operating
software projects — your own infrastructure-as-tool.

> **Status:** v2 alpha, in active design. The published v1.x at
> `@theholocron/cli` is preserved on the `main` branch as an archive
> while v2 work happens on the `v2` branch. See
> [`.notes/tech-architecture.spec.md`](./.notes/tech-architecture.spec.md)
> for the design.

## The idea

Many projects share the same setup work: pick a hosting provider, a
database, an auth provider, a secret manager, a CI host. Wire all the
secrets, the workflows, the deploy configs, the issue tracker.
Holocron makes that work **declarative, swappable, and re-runnable**:

```jsonc
// holocron.config.json
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

Then:

```bash
holocron setup       # apply the whole config, top to bottom, idempotent
holocron doctor      # check that everything is wired correctly
holocron deploy      # ship to hosting via the configured provider
```

## How it works

- **Capabilities** are the contracts (`sourceControl`, `ci`, `issues`,
  `platformSecrets`, `hosting`, `dataStore`, `auth`, `envSecrets`,
  `apiTooling`, `notifications`, `analytics`).
- **Plugins** are npm packages named `holocron-plugin-<provider>` (or
  `@theholocron/holocron-plugin-<provider>` for the built-in set).
  Each plugin exports the capabilities it implements — a single
  provider can cover several (GitHub does source control + CI +
  issues + platform secrets).
- **Config** is ESLint-style: short form `"vercel"` for defaults, tuple
  form `["vercel", { team: "my-team" }]` for options.

## Repo layout (v2)

```
packages/
  cli/              — @theholocron/cli (the binary + capability runtime)
  cli-utils/        — @theholocron/cli-utils (prompts, openers, shell helpers)
.notes/             — design docs (specs follow draft → proposed → approved)
```

## License

MIT. See [`LICENSE`](./LICENSE).
