---
status: proposed # draft → proposed (issue filed) → approved (milestone attached) → archived
issue:
blocked-by: []
---

<!-- editorconfig-checker-disable-file -->

# Bootstrap credentials — keyring-backed token store

> **Decision.** Every holocron plugin's bootstrap credential
> (the token needed to talk to the vendor's API before anything else
> can happen) has a first-class home in the OS keyring, managed by
> `holocron auth <provider>`. Operators never store tokens in env
> vars, dotfiles, or shell profiles unless they explicitly want to
> (CI, per-command overrides). `--token` and env-var precedence
> remain; the keyring is a **new fourth-precedence layer** the
> plugin consults after them.

## Context

A vault plugin exists to hold secrets — but the plugin itself needs
a credential to reach its vendor, and that credential can't live in
the vault it's authenticating against. Chicken-and-egg.

Prior state (v1 → v2 alpha): 1Password shells out to `op`, which
handles its own credential lifecycle via the desktop app + biometric
prompt. Every other plugin resolves its token from env vars, which
pushes the "where do I store this?" question back onto the operator
— typically a `.env.local` file, a shell profile export, or the
same 1Password vault we're deprecating (which reintroduces the
circular dependency).

Doppler-as-vault surfaces the tension explicitly:

- Doppler's own CLI (`doppler login`) stores the token in the OS
  keyring under service `doppler-cli`. `.doppler.yaml` contains
  only a keyring **reference** (`secret-<id>`), not the token
  itself.
- Reading Doppler's yaml file gives us the reference but not the
  bearer. Reading Doppler's keyring entries directly couples us to
  their undocumented service name + key format.
- Shelling out to `doppler configure get token --plain` works but
  reintroduces the CLI-transport pattern we're moving away from
  (even bounded to auth init, it's still a shell-out).

Rather than solve this per-plugin, we make **holocron owns its own
bootstrap-credential store**. Every plugin gets the same auth
precedence layer, every operator gets the same UX, and no plugin
ever has to know about any other vendor's CLI or storage format.

## Design

### Auth precedence (every plugin)

<!-- prettier-ignore -->
```
1. --token          CLI flag (per-command override)
2. HOLOCRON_<X>     holocron-namespaced env var
3. <vendor>-native  vendor's own env var (DOPPLER_TOKEN, etc.)
4. keyring          `com.theholocron.cli` service, key = <provider>
5. AuthError        with a vendor-specific hint
<!-- prettier-ignore -->
```

Steps 1–3 already exist. Step 4 is new. Step 5 gets an upgraded
message: when no token is found, the error names all four options

- a vendor-specific hint pointing at the fastest bootstrap path
  (e.g., Doppler: `doppler configure get token --plain | pbcopy;
holocron auth set doppler <paste>`).

### Keyring service naming

- **Service**: `com.theholocron.cli` (reverse-DNS, matches macOS
  Keychain convention; portable across platforms via the underlying
  library).
- **Account/key**: the provider slug — `doppler`, `infisical`,
  `github`, `vercel`, etc. One entry per provider. No project or
  environment scoping at this layer; per-project vault selection
  happens in `holocron.config.json`, not the keyring.

### Keyring module — `packages/cli/src/keyring.ts`

Thin wrapper over `@napi-rs/keyring` (Rust-based, N-API prebuilt
binaries, no node-gyp; actively maintained; `keytar` is archived).

<!-- prettier-ignore -->
```ts
export async function setToken(provider: string, token: string): Promise<void>;
export async function getToken(provider: string): Promise<string | null>;
export async function deleteToken(provider: string): Promise<void>;
export async function listProviders(): Promise<string[]>;
<!-- prettier-ignore -->
```

`listProviders` iterates provider slugs the CLI knows about (from
loaded config or a static registry) and checks each for a stored
entry. Keyring APIs typically don't expose "list all keys under a
service" — we probe.

### `verifyToken` plugin export convention

Every plugin exports a top-level `verifyToken` alongside
`createPlugin` (mirrors the existing `parseWebhook` pattern for auth
plugins).

<!-- prettier-ignore -->
```ts
export interface VerifyTokenResult {
  ok: true;
  /** Human-readable identifier — "workplace: acme" / "user: cnewton@x" */
  subject: string;
}

export interface VerifyTokenFailure {
  ok: false;
  /** Reason the token was rejected. Surfaces to `holocron auth set` output. */
  message: string;
}

export async function verifyToken(token: string): Promise<VerifyTokenResult | VerifyTokenFailure>;
<!-- prettier-ignore -->
```

Plugin-level export (not a capability method) so the auth command
can call it **without** loading the full plugin — plugin
initialization typically requires an already-resolved token, which
is exactly what we don't have yet.

### `holocron auth <subcommand>`

<!-- prettier-ignore -->
```
holocron auth set <provider> [token]
    Verify + store a token in the keyring.
    Token resolution: positional arg → HOLOCRON_<X>_TOKEN → vendor-native.
    On verify failure, prints a hint (Doppler:
    "run: doppler configure get token --plain").

holocron auth unset <provider>
    Delete the stored keyring entry.

holocron auth check <provider>
    Report stored (yes/no) + valid (yes/no via re-verifyToken).

holocron auth list
    Table of every known provider + storage/validity status.
<!-- prettier-ignore -->
```

All four subcommands soft-skip failures per the standard
orchestrator pattern (`try/catch`, continue, summary counts).

## Plugin integration

Every existing plugin's `auth.ts` gains one line:

<!-- prettier-ignore -->
```ts
import { getToken as getKeyringToken } from "@theholocron/cli";

// after existing --token / HOLOCRON_<X> / <native> checks:
const keyringToken = await getKeyringToken(providerSlug);
if (keyringToken) return keyringToken;
<!-- prettier-ignore -->
```

Every existing plugin's `index.ts` gains a top-level export:

<!-- prettier-ignore -->
```ts
export { verifyToken } from "./verify-token.js";
<!-- prettier-ignore -->
```

New plugins get both baked in via the `holocron-plugin` skill
template (and, later, `holocron plugin create` — see #77).

## CI story

CI never touches the keyring — no login browser flow, no OS
keychain available in containers. CI runs use step 2 or step 3 of
the auth precedence:

- `HOLOCRON_DOPPLER_TOKEN` (or vendor-native equivalent) exposed as
  a GitHub Actions secret.
- `holocron auth set` is a **laptop** command; it's not invoked in
  CI.

`@napi-rs/keyring` gracefully returns platform-unsupported errors
in headless environments; the keyring lookup at precedence step 4
simply returns `null` when unsupported. No CI code path breaks.

## Migration strategy

For this repo's own vault today:

1. Ship the keyring foundation + Doppler plugin in one PR (#8).
2. Update `holocron-plugin-1password`'s `auth.ts` to consult the
   keyring in the same PR — keeps 1P working while we migrate.
   1P vaults typically don't need this (op handles its own auth)
   but the consistency is worth the ~10 lines.
3. Cut over `holocron.config.json` vault from 1password to doppler
   (task #10).
4. Deprecate `holocron-plugin-1password` (task #11).

## What we're deliberately NOT building

- **OAuth device flows** per vendor. Real work, requires the vendor
  to expose OAuth to third-party CLIs, and gets us to the same
  end state (token in keyring). If a vendor genuinely doesn't
  offer a Personal Token, we build OAuth for that vendor.
- **Cross-project vault-of-vaults**. `com.theholocron.cli` is a
  single service scope. If someone runs multiple holocron projects
  on the same machine and wants different Doppler tokens per
  project, they use `--token` or env vars per-project. Not adding
  project-scoped keyring keys until someone asks. When we do:
  additive `scope?` param on `setToken` / `getToken` / `deleteToken`
  keeps existing callers on the default scope; new callers opt in
  via `HOLOCRON_PROFILE` env, a `--scope` flag, or a `profile` field
  in `holocron.config.json`. Non-breaking.
- **Encrypted local file fallback** for platforms without keyring.
  `@napi-rs/keyring` supports macOS Keychain, Linux Secret Service,
  Windows Credential Manager. Bare Linux servers without
  Secret Service (some CI images) fall through to env vars —
  which is what CI uses anyway. No third fallback layer needed.

## Open questions

1. **Auto-detect `doppler configure get token --plain` in the hint
   text?** If the `doppler` binary is on PATH, the error hint could
   even be a copy-pasteable one-liner including the actual token
   fetched. Feels magic and could surprise; leaning toward
   printing the command as text and letting the operator run it.
2. **`holocron auth list` — display only providers with stored
   tokens, or every provider known to the loaded config?** The
   latter is more informative (shows what's missing) but requires
   knowing "every provider" — either from loaded config or a
   static registry. Leaning: from loaded config.
3. **Do we need `holocron auth rotate <provider>`?** i.e., "here's
   a new token, replace the old one after verifying." Could just
   be `holocron auth set <provider> <new-token>` which already
   overwrites. Skip the rotate subcommand until someone asks.
