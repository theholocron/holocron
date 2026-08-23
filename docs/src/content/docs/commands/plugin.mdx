---
title: "plugin create"
description: Scaffold a new @theholocron/holocron-plugin-<slug> package inside the monorepo.
---

```bash
holocron plugin create <slug> <vendor> [--capability <key>] [--token-env <name>] [--vendor-env <name>] [--base-url <url>] [--no-verify]
```

Generates the full scaffold for a new Holocron plugin package. If `--capability`, `--vendor-env`, or `--base-url` are omitted, the CLI prompts interactively.

## Arguments and options

| Argument / Option | Required     | Description                                                                   |
| ----------------- | ------------ | ----------------------------------------------------------------------------- |
| `<slug>`          | Yes          | Package slug in kebab-case (e.g. `stripe`) → creates `holocron-plugin-stripe` |
| `<vendor>`        | Yes          | Vendor display name in PascalCase (e.g. `Stripe`)                             |
| `--capability`    | _(prompted)_ | Capability key the plugin implements                                          |
| `--token-env`     | No           | Holocron env var name for the token (default: `HOLOCRON_<VENDOR>_TOKEN`)      |
| `--vendor-env`    | _(prompted)_ | Vendor-native env var name (e.g. `STRIPE_SECRET_KEY`)                         |
| `--base-url`      | _(prompted)_ | REST base URL (e.g. `https://api.stripe.com`)                                 |
| `--no-verify`     | `false`      | Skip post-scaffold `pnpm install + typecheck + lint + test`                   |

## Available capability keys

`source` · `ci` · `secrets` · `environments` · `issues` · `deployment` · `storage` · `auth` · `vault` · `dns` · `tooling` · `notifications` · `analytics` · `observability`

## What gets generated

- `packages/holocron-plugin-<slug>/` — fully-typed plugin package with:
  - `src/index.ts` — `createPlugin` factory + `AUTH_HINT` + public re-exports
  - `src/auth.ts` — token resolver using `createResolveToken`
  - `src/verify-token.ts` — `verifyToken` called by `holocron auth set`
  - `src/rest.ts` — thin REST client factory
  - `src/capabilities/<capability>.ts` — capability implementation stub
  - `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`
  - `__tests__/` directory with a starter test

## Example

```bash
# Interactive
holocron plugin create stripe Stripe

# Fully non-interactive
holocron plugin create stripe Stripe \
  --capability vault \
  --vendor-env STRIPE_API_KEY \
  --base-url https://api.stripe.com

# Skip post-scaffold checks
holocron plugin create stripe Stripe --no-verify
```
