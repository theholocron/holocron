# Self-hosting — npm publishing via Trusted Publishing

This repo publishes its own `@theholocron/*` packages via **npm Trusted Publishing**
([GA July 2025](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/))
— GitHub Actions OIDC, no stored `NPM_TOKEN`, no token rotation.

Steady state is fully automatic: `semantic-release` on push to `main`
computes the next version, bumps all packages in lockstep, and publishes
via OIDC. This doc covers **the one-time bootstrap** and the
**new-package bootstrap** (both hit the same chicken-and-egg problem).

## The chicken-and-egg

npm requires a package to already exist before you can configure
Trusted Publishing for it. So the actual flow for any new
`@theholocron/*` package is:

1. **One-time manual publish** to establish the package on npm
2. **Configure Trusted Publisher** on npmjs.com for that package
3. **Push to `main`** — subsequent releases go via OIDC

After step 3, no operator action is needed for that package again.

The initial v2 bootstrap ran this for all 7 packages together (via
`holocron npm publish-initial`, which does step 1 in a single
invocation across the workspace). Any new plugin added later needs
to walk through steps 1–2 for itself.

## Step 1 — one-time manual publish

```bash
# From the holocron repo root, on a clean checkout.
# Interactive npm sign-in via the browser (no token stored locally beyond
# npm's own session cookie):
npm login --auth-type=web

# Build everything fresh:
pnpm install --frozen-lockfile
pnpm build

# Run the holocron one-shot bootstrap publish. Verifies npm auth, runs
# `pnpm publish -r` with the right filters, prints direct links to each
# package's Trusted Publisher config page.
#
# If your npm account requires 2FA for writes (recommended), grab a
# one-time password from your authenticator and pass it via --otp. The
# same code is reused across all sequential publishes — they happen in
# seconds, comfortably inside the TOTP window.
pnpm exec tsx packages/cli/src/cli.ts npm publish-initial --otp 123456
```

The bootstrap command does the publish + reminds you exactly which URLs
to visit for step 2. The session token from `npm login` is local-only;
never enters CI.

Add `--dry-run` to print what would happen without actually publishing.
If you forget `--otp` and your account needs it, the command detects
the `EOTP` error in the output and prints the corrected command.

## Step 2 — configure Trusted Publisher for each package

In the npm web UI, for each `@theholocron/*` package:

1. Sign in at <https://www.npmjs.com>
2. Navigate to the package → Settings → Trusted Publishers
3. Configure:
	- **Publisher**: GitHub Actions
	- **Organization**: `theholocron`
	- **Repository**: `holocron`
	- **Workflow filename**: `release.yml`
	- **Environment** (optional): leave blank

Currently configured (as of v2.0.0-alpha.0):

- `@theholocron/cli`
- `@theholocron/holocron-plugin-github`
- `@theholocron/holocron-plugin-vercel`
- `@theholocron/holocron-plugin-neon`
- `@theholocron/holocron-plugin-clerk`
- `@theholocron/holocron-plugin-1password`
- `@theholocron/holocron-plugin-postman`

If npm's UI exposes org-level Trusted Publishers in the future, one
config at the `@theholocron` org will apply to every package under the
scope — retire the per-package rows in that case.

## Step 3 — subsequent releases run themselves

Push to `main` fires `.github/workflows/release.yml`. The workflow
requests an OIDC token from GitHub (permitted by `id-token: write`),
`pnpm publish` exchanges it with npm, npm validates against the
registered Trusted Publisher, and the publish proceeds. Provenance
attestations attach automatically — no `--provenance` flag needed.
Each version on npm shows a verified ✓ linking back to the CI run
that produced it.

## Ad-hoc secret setting (still useful)

For one-off secrets that ARE token-based (not covered by OIDC), the
`secret set` command still helps:

```bash
# Example: set a Vercel deploy hook secret on the holocron repo
DEPLOY_HOOK=https://api.vercel.com/.../v1 HOLOCRON_GH_TOKEN=ghp_xxx \
	holocron secret set DEPLOY_HOOK
```

Replaces clicking through GH Settings → Secrets → Actions → New for
any CI secret that isn't covered by OIDC. Same pattern across your
projects, not just this one.
