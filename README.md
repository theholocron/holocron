# Holocron

A pluggable, capability-based CLI for spinning up and operating
software projects — your own infrastructure-as-tool.

> **Status:** v2 alpha, in active design. The published v1.x at
> `@theholocron/cli` is preserved on the `main` branch as an archive
> while v2 work happens on the `v2` branch. See
> [`.notes/tech-architecture.spec.md`](./.notes/tech-architecture.spec.md)
> for the design (tracked in [#74](https://github.com/theholocron/holocron/issues/74)).

## The idea

Many projects share the same setup work: pick a hosting provider, a
database, an auth provider, a secret vault, a CI host. Wire all the
secrets, the workflows, the deploys, the issue tracker. Holocron
makes that work **declarative, swappable, and re-runnable**.

```jsonc
// holocron.config.json
{
  "project": { "name": "my-app" },

  "providers": {
    // Code + CI
    "source":        "github",
    "ci":            "github",
    "secrets":       "github",
    "environments":  "github",
    "issues":        "github",

    // Hosting + data
    "deployment":    ["vercel", { "team": "my-team" }],
    "storage":       ["neon",   { "kind": "postgres" }],
    "auth":          "clerk",
    "dns":           "cloudflare",

    // Source of truth for secrets (required)
    "vault":         ["1password", { "vault": "my-app" }],

    // Multi-provider
    "tooling":       ["postman", "storybook"],
    "notifications": ["slack",   "discord"],
    "analytics":     ["google"],
    "observability": ["sentry"]
  }
}
```

Then:

```bash
holocron setup           # apply the whole config, top to bottom
holocron doctor          # check everything's wired right
holocron secrets sync    # vault → secrets + deployment env vars + .env
holocron deploy          # ship to your `deployment` provider
```

## How it works

- **Capabilities** are the contracts (14 of them — see the
  [architecture spec](./.notes/tech-architecture.spec.md)).
- **Plugins** are npm packages named `holocron-plugin-<provider>`
  (or `@theholocron/holocron-plugin-<provider>` for the built-in
  set). Each plugin exports the capabilities it implements — a
  single provider can cover several (GitHub does source + CI +
  issues + secrets + environments).
- **Config** is ESLint-style: short form `"vercel"` for defaults,
  tuple form `["vercel", { team: "my-team" }]` for options,
  multi-list `["slack", "discord"]` for capabilities that allow
  several providers active at once.

## The vault is special

Every project has secrets somewhere. They don't go in the repo, they
don't go in the config — they go in the **vault**, which is the only
required capability. Everything else that needs secrets (CI, runtime
env vars, local `.env`) syncs FROM the vault:

```
vault (1Password)
  ├─→ secrets       (GitHub Actions)
  ├─→ deployment    (Vercel env vars)
  └─→ local .env    (for dev)
```

## Repo layout (v2)

```
packages/
  cli/                          — @theholocron/cli            (binary + capability runtime)
  cli-utils/                    — @theholocron/cli-utils      (prompts, openers, shell helpers)
  holocron-plugin-github/       — @theholocron/holocron-plugin-github (first plugin)
.notes/                         — design specs (draft → proposed → approved)
```

## License

MIT. See [`LICENSE`](./LICENSE).
