---
title: Self-hosting (npm Publishing)
description: How Holocron publishes its own packages via OIDC Trusted Publishing, and how to bootstrap new packages.
---

Holocron publishes its own `@theholocron/*` packages via **npm Trusted Publishing** (GitHub Actions OIDC) — no stored `NPM_TOKEN`, no token rotation. Steady state is fully automatic: `semantic-release` on push to `main` computes the next version, bumps all packages in lockstep, and publishes via OIDC.

This page covers the one-time bootstrap and new-package bootstrap — both hit the same chicken-and-egg problem.

## The chicken-and-egg

npm requires a package to already exist before you can configure Trusted Publishing for it. The flow for any new `@theholocron/*` package is:

1. **One-time manual publish** — establish the package on npm
2. **Configure Trusted Publisher** on npmjs.com
3. **Push to `main`** — all subsequent releases go via OIDC automatically

## Step 1 — One-time manual publish

```bash
# From the holocron repo root.
# Interactive npm sign-in via the browser (no token stored in CI):
npm login --auth-type=web

# Build everything fresh:
pnpm install --frozen-lockfile
pnpm build

# Run the one-shot bootstrap publish. Prints direct links to each package's
# Trusted Publisher config page after publishing.
#
# If your npm account requires 2FA for writes, grab a one-time password
# from your authenticator and pass it via --otp. The same code is reused
# across all sequential publishes — they happen within seconds.
pnpm exec tsx packages/cli/src/cli.ts npm publish-initial --otp 123456
```

Add `--dry-run` to print what would happen without publishing. If you forget `--otp` and your account needs it, the command detects the `EOTP` error and prints the corrected command.

## Step 2 — Configure Trusted Publisher for each package

In the npm web UI, for each `@theholocron/*` package:

1. Sign in at https://www.npmjs.com
2. Navigate to the package → Settings → Trusted Publishers
3. Configure:
   - **Publisher**: GitHub Actions
   - **Organization**: `theholocron`
   - **Repository**: `holocron`
   - **Workflow filename**: `release.yml`
   - **Environment** (optional): leave blank

## Step 3 — Subsequent releases run automatically

Push to `main` fires `release.yml`. The workflow requests an OIDC token from GitHub, `pnpm publish` exchanges it with npm, npm validates against the registered Trusted Publisher, and the publish proceeds with provenance attestations attached automatically.

## Adding a new plugin

When adding a new `holocron-plugin-*` package:

1. Add it to the workspace packages.
2. Run `npm login --auth-type=web` locally.
3. Run `holocron npm publish-initial --tag alpha` (or `--dry-run` first).
4. Visit the npm UI and configure Trusted Publisher for the new package (same settings as above).
5. Future releases via `main` will include the new package automatically.

## Release versioning

Holocron uses `semantic-release` with lockstep versioning — all packages in `packages/*/` advance to the same version on every release. The `release.config.ts` `prepareCmd` uses `holocron npm bump-versions` to patch every `package.json` in the workspace.
