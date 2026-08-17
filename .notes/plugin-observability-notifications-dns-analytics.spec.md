---
status: draft
issue: ~
blocked-by: []
---

# New plugins — observability, notifications, dns, analytics

Four capability slots defined in `capabilities/index.ts` have no implementing
plugin. This spec covers all four. Each follows the same structural pattern as
existing plugins (`neon`, `clerk`, `postman`, `vercel`).

---

## Prerequisite: extend `Observability` and `Analytics` interfaces

`Observability` and `Analytics` currently expose only `describe()`. For
`holocron setup` to provision these services, both need optional extension
methods. The `describe()` return type also changes from `dsnEnvKey: string` to
`envKeys: string[]`, matching the `Auth` pattern — providers like Sentry and
PostHog push multiple env vars to GitHub Secrets and the caller needs all of
them. Update `packages/cli/src/capabilities/index.ts`:

```typescript
export interface Observability extends ProviderIdentity {
	readonly key: "observability";
	// envKeys replaces dsnEnvKey — providers push more than one env var
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	// new — optional so existing code compiles unchanged
	whoami?(): Promise<{ org: string }>;
	ensureProject?(input: { name: string; platform?: string }): Promise<{
		dsn: string;
		alreadyExists: boolean;
	}>;
}

export interface Analytics extends ProviderIdentity {
	readonly key: "analytics";
	// envKeys replaces dsnEnvKey
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	// new — optional so existing code compiles unchanged
	whoami?(): Promise<{ org: string }>;
	ensureProject?(name: string): Promise<{
		token: string;
		alreadyExists: boolean;
	}>;
}
```

`Notifications` and `Dns` are already sufficient as defined.

Note: `observability`, `notifications`, `analytics`, and `tooling` all carry
`"many"` cardinality in `CARDINALITY` already — multiple plugins of the same
type can be active simultaneously. No cardinality changes are needed.

---

## 1. `holocron-plugin-sentry` — `observability`

**Package:** `@theholocron/holocron-plugin-sentry`

### Capability

```typescript
readonly key = "observability" as const;
readonly providerName = "sentry";
```

Because `observability` cardinality is `"many"`, Sentry can run alongside future
observability plugins (Datadog, New Relic, etc.) — all active at once, each
receiving `holocron setup` calls independently.

### Plugin options

```typescript
export interface SentryPluginOptions extends ResolveTokenInput {
	/** Sentry organization slug. Required. */
	org: string;
	/**
	 * Default team slug for project creation. Defaults to the org slug
	 * when omitted (Sentry auto-assigns to the first available team).
	 */
	team?: string;
	/** Override base URL for tests. Default: https://sentry.io */
	baseUrl?: string;
	fetch?: typeof fetch;
}
```

### Auth

- Token type: Sentry **auth token** (user-owned or org-owned)
- Required scopes: `project:read`, `project:write`, `org:read`
- Env var: `HOLOCRON_SENTRY_TOKEN`
- Where to generate: **Settings → Account → API → Auth Tokens**
  (org tokens: **Settings → [org] → Developer Settings → Auth Tokens**)
- Both user tokens and org tokens are accepted; org tokens are preferred for
  CI automation. Document the difference in the plugin README but accept both —
  the API calls are identical regardless of token type.

```typescript
export const AUTH_HINT =
	"generate an auth token at https://sentry.io/settings/account/api/auth-tokens/ " +
	"with project:read, project:write, and org:read scopes, " +
	"then run: holocron auth set sentry <TOKEN>";
```

### Key API calls

Base URL: `https://sentry.io/api/0`

| Method | Purpose |
|---|---|
| `GET /auth/` | `whoami()` — verify token; returns `{ user: { username } }` |
| `GET /organizations/{org}/projects/` | List projects for existence check |
| `POST /teams/{org}/{team}/projects/` | Create project; body `{ name, platform }` |
| `GET /projects/{org}/{slug}/keys/` | Get DSN; returns `[{ dsn: { public } }]` |

### Implementation sketch

```typescript
async ensureProject(input: { name: string; platform?: string }) {
	// 1. Check existence — Sentry has no idempotent create endpoint
	const existing = await this.client.projects.list(this.opts.org);
	const found = existing.find(p => p.slug === slugify(input.name));
	if (found) {
		const keys = await this.client.projects.keys(this.opts.org, found.slug);
		return { dsn: keys[0].dsn.public, alreadyExists: true };
	}
	// 2. Create under team
	const team = this.opts.team ?? this.opts.org;
	const project = await this.client.projects.create(this.opts.org, team, {
		name: input.name,
		platform: input.platform ?? "node",
	});
	const keys = await this.client.projects.keys(this.opts.org, project.slug);
	return { dsn: keys[0].dsn.public, alreadyExists: false };
}

async describe() {
	return {
		provider: "sentry",
		envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
	};
}
```

### `holocron setup` integration

1. Call `ensureProject({ name: repoSlug })` → get DSN string
2. Push both `SENTRY_DSN=<dsn>` and `NEXT_PUBLIC_SENTRY_DSN=<dsn>` to GitHub
   Secrets via the `secrets` capability — same value, different names, both
   required by the Sentry Next.js SDK
3. Derive `platform` from `runtime_environment` in `holocron.config` repo
   properties (`"browser"` → `"javascript"`, else `"node"`)

---

## 2. `holocron-plugin-slack` — `notifications`

**Package:** `@theholocron/holocron-plugin-slack`

### Capability

```typescript
readonly key = "notifications" as const;
readonly providerName = "slack";
```

### Plugin options

```typescript
export interface SlackPluginOptions extends ResolveTokenInput {
	/**
	 * Fallback channel id when `send()` is called without an explicit
	 * channel. Accepts a channel id (C…) or name (#general).
	 * Channel IDs are stable; prefer them over names.
	 */
	defaultChannel?: string;
	/** Override base URL for tests. Default: https://slack.com/api */
	baseUrl?: string;
	fetch?: typeof fetch;
}
```

### Auth

- Token type: **Bot token** (`xoxb-*`)
- Required scopes: `chat:write`
- Optional scopes: `channels:read` (for name → id resolution)
- Env var: `HOLOCRON_SLACK_TOKEN`
- Where to generate: **api.slack.com/apps → [your app] → OAuth & Permissions**

```typescript
export const AUTH_HINT =
	"create a Slack app at https://api.slack.com/apps, add the chat:write bot scope, " +
	"install it to your workspace, then run: holocron auth set slack <xoxb-TOKEN>";
```

### Key API calls

Base URL: `https://slack.com/api`

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/auth.test` | `verifyToken` — returns `{ team, user }` |
| `POST` | `/chat.postMessage` | `send(channel, message)` |

### Implementation sketch

```typescript
async send(channel: string, message: string): Promise<void> {
	const ch = channel || this.opts.defaultChannel;
	if (!ch) throw new Error("SlackNotifications.send: channel required");
	const res = await this.client.post("chat.postMessage", {
		channel: ch,
		text: message,
	});
	if (!res.ok) throw new ProviderApiError(res.error ?? "unknown", 400, res);
}
```

### Notes

- No `whoami()` in the `Notifications` interface; token verification is a
  standalone `verifyToken` export (same pattern as all other plugins).
- `notifications` cardinality is `"many"` — Slack and Discord can both be
  active simultaneously, each routing to their own channels.

---

## 3. `holocron-plugin-discord` — `notifications`

**Package:** `@theholocron/holocron-plugin-discord`

### Capability

```typescript
readonly key = "notifications" as const;
readonly providerName = "discord";
```

### Auth model: webhooks over bot tokens

Discord supports both a full Bot API and per-channel Incoming Webhooks. Webhooks
are the right choice here: they require no bot in a server, no OAuth2
application, and no `MANAGE_WEBHOOKS` permission — just a URL the channel owner
generates in Discord's UI. The `send()` interface maps cleanly: `channel` is
the webhook URL (or a named alias resolved from plugin options), `message` is
the content.

Bot tokens are out of scope for v1. They add complexity (guild membership,
intent declarations, permission grants) without benefit for a simple
notification use case.

### Plugin options

```typescript
export interface DiscordPluginOptions extends ResolveTokenInput {
	/**
	 * Named webhook aliases — map a logical channel name to its webhook URL.
	 * Allows `send("deploys", msg)` instead of passing the full URL.
	 *
	 * Example: { deploys: "https://discord.com/api/webhooks/123/abc" }
	 */
	webhooks?: Record<string, string>;
	/**
	 * Default webhook URL (or alias key) used when `send()` is called
	 * without an explicit channel.
	 */
	defaultChannel?: string;
	/** Override base URL for tests. Default: https://discord.com/api/v10 */
	baseUrl?: string;
	fetch?: typeof fetch;
}
```

### Auth

- Token type: **Incoming Webhook URL**
  (`https://discord.com/api/webhooks/{id}/{token}`)
- Env var: `HOLOCRON_DISCORD_WEBHOOK` (the full URL; no separate token)
- Where to generate: **Discord → channel settings → Integrations → Webhooks**

The webhook URL itself is the credential. Store it as the env var value rather
than using `ResolveTokenInput`'s token field for a separate token.
`verifyToken` can do a `GET` to the webhook URL (returns `{ id, name, ... }`)
to confirm it is reachable and valid.

```typescript
export const AUTH_HINT =
	"create a webhook in Discord → channel settings → Integrations → Webhooks, " +
	"copy the URL, then run: holocron auth set discord <WEBHOOK_URL>";
```

### Key API calls

Base URL: `https://discord.com/api/v10`

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/webhooks/{id}/{token}` | `verifyToken` — confirm webhook is valid |
| `POST` | `/webhooks/{id}/{token}` | `send()` — body `{ content: message }` |

### Implementation sketch

```typescript
private resolve(channel: string): string {
	// Channel is either an alias key or a raw webhook URL.
	const alias = this.opts.webhooks?.[channel];
	if (alias) return alias;
	if (channel.startsWith("https://")) return channel;
	const def = this.opts.defaultChannel
		? (this.opts.webhooks?.[this.opts.defaultChannel] ?? this.opts.defaultChannel)
		: undefined;
	if (def) return def;
	throw new Error(`DiscordNotifications.send: unknown channel "${channel}"`);
}

async send(channel: string, message: string): Promise<void> {
	const webhookUrl = this.resolve(channel || this.opts.defaultChannel ?? "");
	// Extract id/token from URL to build the API path.
	const match = webhookUrl.match(/webhooks\/(\d+)\/([^/?]+)/);
	if (!match) throw new Error(`Invalid Discord webhook URL: ${webhookUrl}`);
	await this.client.post(`/webhooks/${match[1]}/${match[2]}`, {
		content: message,
	});
}
```

### Notes

- `webhooks` option lets `holocron.config.ts` name channels logically
  (`"deploys"`, `"alerts"`) without embedding raw URLs. The URLs live in
  environment variables and are resolved at plugin load time.
- Discord webhook `POST` returns `204 No Content` on success — no response
  body to parse, just check for non-2xx.
- Rate limit: Discord webhooks allow 30 requests per minute per webhook. For
  CI notification use cases this is not a concern.

---

## 4. `holocron-plugin-cloudflare` — `dns`

**Package:** `@theholocron/holocron-plugin-cloudflare`

### Capability

```typescript
readonly key = "dns" as const;
readonly providerName = "cloudflare";
```

### Plugin options

```typescript
export interface CloudflarePluginOptions extends ResolveTokenInput {
	/**
	 * Cloudflare account id. Optional for standard DNS operations;
	 * required only for account-scoped endpoints (e.g., custom nameservers).
	 * Callers that need account-scoped ops receive a clear error at call
	 * time if this is absent — no startup-time throw.
	 */
	accountId?: string;
	/** Override base URL for tests. Default: https://api.cloudflare.com/client/v4 */
	baseUrl?: string;
	fetch?: typeof fetch;
}
```

### Auth

- Token type: **API Token** (scoped; preferred over the legacy Global API Key)
- Required permissions: `Zone:Read`, `DNS:Edit`
- Env var: `HOLOCRON_CLOUDFLARE_TOKEN`
- Where to generate: **dash.cloudflare.com/profile/api-tokens**
- Token verification: `GET /user/tokens/verify` — exposed as standalone
  `verifyToken` export, same pattern as all other plugins.

```typescript
export const AUTH_HINT =
	"create an API token at https://dash.cloudflare.com/profile/api-tokens " +
	"with Zone:Read and DNS:Edit permissions, " +
	"then run: holocron auth set cloudflare <TOKEN>";
```

### Key API calls

Base URL: `https://api.cloudflare.com/client/v4`

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/user/tokens/verify` | `verifyToken` |
| `GET` | `/zones?name={domain}` | Resolve domain → zone id |
| `GET` | `/zones/{zoneId}/dns_records` | `listRecords()` |
| `POST` | `/zones/{zoneId}/dns_records` | Create record |
| `PATCH` | `/zones/{zoneId}/dns_records/{id}` | Update record |
| `DELETE` | `/zones/{zoneId}/dns_records/{id}` | `deleteRecord()` |

### Implementation sketch

```typescript
// Zone id is cached per domain name for the plugin instance lifetime.
private zoneCache = new Map<string, string>();

private async resolveZone(domain: string): Promise<string> {
	if (this.zoneCache.has(domain)) return this.zoneCache.get(domain)!;
	// Walk from the full domain up to find the apex zone.
	const parts = domain.split(".");
	for (let i = 0; i < parts.length - 1; i++) {
		const candidate = parts.slice(i).join(".");
		const zones = await this.client.zones.list({ name: candidate });
		if (zones.result.length > 0) {
			this.zoneCache.set(domain, zones.result[0].id);
			return zones.result[0].id;
		}
	}
	throw new ProviderApiError(`No Cloudflare zone found for: ${domain}`, 404, undefined);
}

async upsertRecord(domain: string, record: DnsRecord): Promise<DnsRecord> {
	const zoneId = await this.resolveZone(domain);
	const existing = await this.client.dns.list(zoneId, {
		type: record.type,
		name: record.name,
	});
	if (existing.result.length > 0) {
		// Multiple same-type records (e.g. two TXT for SPF + DKIM): update
		// only the first match and leave others intact. Documented limitation.
		const updated = await this.client.dns.update(zoneId, existing.result[0].id, record);
		return mapRecord(updated.result);
	}
	const created = await this.client.dns.create(zoneId, record);
	return mapRecord(created.result);
}
```

### Notes

- The Cloudflare API wraps every response in `{ result, success, errors }`.
  The REST client unwraps and throws `ProviderApiError` on `success: false`.
- `DnsRecord.id` is optional in the capability interface. Cloudflare always
  returns one; include it in the mapped output.
- `upsertRecord` with multiple same-name/same-type records updates the first
  match only. This is a documented limitation, not a bug — callers managing
  multiple TXT records (SPF + DKIM + domain verification) should use
  `listRecords` + `deleteRecord` + explicit creates instead.

---

## 5. `holocron-plugin-posthog` — `analytics`

**Package:** `@theholocron/holocron-plugin-posthog`

> **Decision: PostHog over alternatives.**
> Segment requires a paid plan for project creation APIs. Amplitude and
> Plausible have no programmatic project-creation endpoint at all. PostHog
> is the only provider that creates a project and returns the tracking token
> in a single free-tier API call (`POST /api/projects/`).

### Capability

```typescript
readonly key = "analytics" as const;
readonly providerName = "posthog";
```

### Plugin options

```typescript
export interface PostHogPluginOptions extends ResolveTokenInput {
	/**
	 * PostHog instance host. Defaults to US cloud.
	 * EU cloud: "https://eu.posthog.com"
	 * Self-hosted: your own base URL.
	 */
	host?: string;
	/** Override base URL for tests (takes precedence over `host`). */
	baseUrl?: string;
	fetch?: typeof fetch;
}
```

`host` stays as a plugin option rather than a top-level `holocron.config`
field. Repos that share a PostHog org across different regions are uncommon;
if that pattern emerges, promote it then.

### Auth

- Token type: **Personal API key** (`phx_*`, from Settings → Personal API keys)
- Scope: org-level; can create/list projects across the org
- Env var: `HOLOCRON_POSTHOG_TOKEN`
- **Distinct from the project API key** — that `phc_*` token is what the app
  embeds at runtime. The personal API key is used only by this plugin for
  management. Do not validate the token prefix — self-hosted instances may
  issue differently formatted keys.

```typescript
export const AUTH_HINT =
	"create a personal API key at https://app.posthog.com/settings/user/api-keys " +
	"(not the project API key — that is the client-side tracking token), " +
	"then run: holocron auth set posthog <phx_KEY>";
```

### Key API calls

Base URL: `{host}` (default `https://app.posthog.com`)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/users/@me/` | `whoami()` — verify key; returns `{ email, organization }` |
| `GET` | `/api/projects/` | List projects for existence check |
| `POST` | `/api/projects/` | Create project; body `{ name }`; returns `{ api_token }` |

### Implementation sketch

```typescript
async ensureProject(name: string): Promise<{ token: string; alreadyExists: boolean }> {
	const projects = await this.client.projects.list();
	const found = projects.results.find(p => p.name === name);
	if (found) {
		return { token: found.api_token, alreadyExists: true };
	}
	const project = await this.client.projects.create({ name });
	return { token: project.api_token, alreadyExists: false };
}

async describe() {
	return {
		provider: "posthog",
		envKeys: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
	};
}
```

### `holocron setup` integration

1. Call `ensureProject(repoSlug)` → get `api_token`
2. Push `NEXT_PUBLIC_POSTHOG_KEY=<api_token>` to GitHub Secrets
3. Push `NEXT_PUBLIC_POSTHOG_HOST=<host>` to GitHub Secrets — the PostHog SDK
   requires both; `NEXT_PUBLIC_POSTHOG_HOST` is the resolved `host` option value

### Notes

- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` are the Next.js
  conventions. For v1, always use these names. A future `envKeyPrefix` plugin
  option (`VITE_`, `""`) can handle non-Next frameworks without changing the
  interface.
- Both US (`app.posthog.com`) and EU (`eu.posthog.com`) clouds are supported
  via `host`. Default to US; EU users set `host: "https://eu.posthog.com"` in
  `holocron.config`.

---

## Shared implementation notes

All five packages follow the same scaffold:

```
packages/
  holocron-plugin-{name}/
    src/
      index.ts            # createPlugin, createContext, AUTH_HINT, re-exports
      auth.ts             # resolveToken, ResolveTokenInput
      rest.ts             # createClient, typed REST helpers
      verify-token.ts     # verifyToken (standalone, used by `holocron auth check`)
      capabilities/
        {cap}.ts          # the capability class
      __tests__/
        {cap}.test.ts
        helpers.ts        # stubFetch, fixture builders
    package.json
    tsconfig.json
    tsdown.config.ts
```

Peer dependency on `@theholocron/cli` for capability interfaces and
`ProviderApiError`. No dependency on `@theholocron/http-client` directly —
go through `@theholocron/cli` re-exports.

Add each package to `.releaserc.json`'s `prepareCmd` array (alphabetical),
and to `codecov.yml`'s `component_management.individual_components`.
