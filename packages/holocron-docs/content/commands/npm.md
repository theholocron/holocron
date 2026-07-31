---
title: "npm"
description: npm-related monorepo utilities for lockstep versioning and initial package publishing.
---

The `npm` subcommand group contains utilities for managing npm publishing in a lockstep monorepo.

## `npm bump-versions <new-version>`

```bash
holocron npm bump-versions <version>
```

Bumps every non-private package's `version` field in `packages/*/package.json` to `<new-version>`. Used as the `prepareCmd` in `release.config.ts` during a `semantic-release` run.

### Options

| Option | Description |
| --- | --- |
| `<version>` | Target version (e.g. `4.2.0` or `2.0.0-alpha.1`) |
| `--dry-run` | Print what would change without writing any files |
| `--cwd` | Monorepo root (default: `process.cwd()`) |

### Example

```bash
# In release.config.ts:
prepareCmd: "node packages/cli/dist/cli.mjs npm bump-versions ${nextRelease.version}"

# Manual invocation:
holocron npm bump-versions 4.2.0 --dry-run
```

---

## `npm publish-initial`

```bash
holocron npm publish-initial [--tag <tag>] [--otp <code>] [--dry-run]
```

One-shot bootstrap publish for new packages that haven't been registered on npm yet. Solves the chicken-and-egg problem: npm Trusted Publishing (OIDC) requires the package to exist before you can configure it, so the first publish must happen with browser auth.

### Workflow

```bash
# 1. Log in via browser (no token stored in CI)
npm login --auth-type=web

# 2. Build everything
pnpm install --frozen-lockfile && pnpm build

# 3. Bootstrap publish (prints Trusted Publisher config links after)
holocron npm publish-initial --otp 123456
```

After the command runs, visit each package's npm page → Settings → Trusted Publishers to complete the setup (see [Self-hosting](../self-hosting)).

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--tag` | `alpha` | npm distribution tag |
| `--otp` | — | TOTP code from your authenticator (if 2FA is required for writes) |
| `--dry-run` | `false` | Print what would be published without publishing |

### Notes

- Packages marked `"private": true` in their `package.json` are skipped automatically.
- If the command detects `NPM_TOKEN` in env, it prints a reminder to revoke the token after the bootstrap.
- If the publish fails with `EOTP`, the corrected command with `--otp` is printed.
