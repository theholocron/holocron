---
status: draft
issue: 369
blocked-by: []
---

# Org-scoped token resolution

Support multiple orgs on a single machine without collision in the keyring.
Today every plugin stores one token per service (e.g. `cloudflare`). A user
working across two GitHub orgs — say `theholocron` and a separate client org —
needs separate Cloudflare, Sentry, Slack, etc. credentials for each. The
keyring has no way to distinguish them, so whichever token was stored last wins.

---

## Goals

- One keyring entry per org per service — no collision, no manual switching.
- `HOLOCRON_ORG` in the environment works for both CI-like automation and local
  shell sessions (direnv, `.env`, plain `export` — all identical from the
  runtime's perspective).
- `--org` flag available on any command for one-off overrides without touching
  the environment.
- `org` already present in `holocron.config.ts` covers the most common case
  automatically — no extra config for projects that already declare it.
- Backward compatible — existing single-org setups (no `org` qualifier) keep
  working with no changes.

---

## Org resolution order

The active org name is resolved once per command invocation, in priority order:

1. `--org <name>` CLI flag — explicit per-invocation override
2. `HOLOCRON_ORG` env var — set by direnv, a `.env` file, a shell profile, or
   any other mechanism; from the runtime's perspective these are all identical
3. `org` from `holocron.config.ts` — automatic when running inside a project
   that already declares its org

If none of these resolve, no org is active and token resolution falls back to
the unnamespaced keyring key (existing behavior, fully backward compatible).

---

## Token resolution order

Unchanged except the keyring step splits into two:

1. `--token <TOKEN>` CLI flag
2. `HOLOCRON_<SERVICE>_TOKEN` env var (e.g. `HOLOCRON_CLOUDFLARE_TOKEN`)
3. Vendor env var (e.g. `CLOUDFLARE_API_TOKEN`, `SLACK_BOT_TOKEN`)
4. Keyring `<service>.<org>` — only attempted when an org was resolved
5. Keyring `<service>` — unnamespaced fallback; backward-compatible default

Step 4 fires first when an org is active so that org-specific entries take
precedence over a legacy default entry. Step 5 ensures that users with only a
single org never need to re-register their existing token.

---

## `auth set` changes

Add `--org <name>` flag to `holocron auth set`:

```bash
# Store a token scoped to a specific org
holocron auth set cloudflare --org theholocron <TOKEN>
holocron auth set cloudflare --org rando-co    <TOKEN>

# Store an unnamespaced default (existing behavior, unchanged)
holocron auth set cloudflare <TOKEN>
```

The stored keyring key is `<service>` when no `--org` is given, and
`<service>.<org>` when `--org` is provided. `auth check` follows the same flag.

---

## `auth check` changes

`holocron auth check <service>` resolves the token using the same order as all
other commands (flag → env → config → keyring). `--org` overrides which keyring
slot is tested:

```bash
holocron auth check cloudflare --org theholocron
holocron auth check cloudflare --org rando-co
holocron auth check cloudflare          # tests the unnamespaced default
```

---

## `ResolveTokenInput` changes (`@theholocron/http-client`)

Add an `org` field so the CLI layer can inject the resolved org into plugin
token resolution without going through a global:

```typescript
export interface ResolveTokenInput {
  cliToken?: string;
  env?: NodeJS.ProcessEnv;
  keyring?: (provider: string) => string | null;
  /** Active org name — drives namespaced keyring lookup (<service>.<org>). */
  org?: string;
}
```

`createResolveToken` reads `org` from input and also falls back to
`env['HOLOCRON_ORG']` (allowing plugins called directly — outside the CLI —
to pick up the env var automatically):

```typescript
return function resolveToken(input: ResolveTokenInput = {}): string {
  const env = input.env ?? process.env;
  const keyring = input.keyring ?? defaultKeyring;
  const org = input.org ?? env['HOLOCRON_ORG'];

  const token =
    input.cliToken ||
    env[config.envName] ||
    env[config.vendorEnvName] ||
    (org ? keyring(`${config.keyringService}.${org}`) : null) ||
    keyring(config.keyringService);

  if (!token) throw new AuthError(config.errorMessage);
  return token;
};
```

No changes to individual plugin packages — they pass `ResolveTokenInput`
through as-is and the new `org` field flows automatically.

---

## CLI layer changes (`@theholocron/cli`)

### Global `--org` flag

Add `--org <name>` as a global option (alongside `--token`). When present it is
injected into every `ResolveTokenInput` passed to plugin factories for that
invocation.

### Org resolution at command startup

```typescript
function resolveOrg(argv: { org?: string }, config: HolocronConfig): string | undefined {
  return argv.org ?? process.env['HOLOCRON_ORG'] ?? config.org;
}
```

This resolved value is passed as `org` to every plugin `createPlugin` call
and to `auth set` / `auth check`.

---

## Local workflow examples

### Single-org user (existing behavior, unchanged)

```bash
holocron auth set cloudflare <TOKEN>   # stored as "cloudflare"
cd ~/Code/theholocron/some-project
holocron setup                         # resolves "cloudflare" from keyring
```

### Multi-org user with `holocron.config.ts`

```bash
# One-time setup per org
holocron auth set cloudflare --org theholocron <TOKEN-A>
holocron auth set cloudflare --org rando-co    <TOKEN-B>

# theholocron project — config declares org: "theholocron"
cd ~/Code/theholocron/some-project
holocron setup   # resolves "cloudflare.theholocron" automatically

# rando-co project — config declares org: "rando-co"
cd ~/Code/rando-co/some-project
holocron setup   # resolves "cloudflare.rando-co" automatically
```

### Multi-org user with direnv (no `holocron.config.ts` org field)

```bash
# ~/Code/rando-co/.envrc
export HOLOCRON_ORG=rando-co
```

```bash
cd ~/Code/rando-co/any-project
# direnv exports HOLOCRON_ORG=rando-co into the shell
holocron setup   # resolves "cloudflare.rando-co" from keyring
```

### One-off override

```bash
holocron deploy --org rando-co   # ignores config org, uses rando-co keyring entries
```

---

## Implementation order

1. `@theholocron/http-client` — add `org` to `ResolveTokenInput`; update
   `createResolveToken` to attempt `<service>.<org>` before `<service>`
2. `@theholocron/cli` — add global `--org` flag; inject resolved org into all
   plugin `createPlugin` calls and `auth set` / `auth check`
3. Docs — update the Token Reference page and each plugin README `## Auth`
   section to document the `--org` flag and `HOLOCRON_ORG` env var

Plugin packages (`holocron-plugin-*`) require no changes.
