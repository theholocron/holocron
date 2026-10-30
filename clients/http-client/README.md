# @theholocron/http-client

Shared HTTP primitives for theholocron tooling — REST client factory, token resolver, and base error types. Used internally by `@theholocron/cli` and all plugin packages; publish your own clients on top of it.

## Installation

```bash
pnpm add @theholocron/http-client
```

## API

### `createRestClient(config)`

Factory that returns a `RestClient` — a thin fetch wrapper with bearer/API-key auth, JSON body handling, query param merging, and structured error wrapping.

```ts
import { createRestClient } from "@theholocron/http-client";

const client = createRestClient({
  baseUrl: "https://api.example.com",
  token: process.env.EXAMPLE_TOKEN!,
  vendor: "Example", // prefix for error messages
});

const data = await client.request<{ id: string }>("/widgets/42");
```

**Config options:**

| Option          | Type                     | Default            | Description                                                  |
| --------------- | ------------------------ | ------------------ | ------------------------------------------------------------ |
| `baseUrl`       | `string`                 | —                  | Base URL, trailing slashes trimmed automatically             |
| `token`         | `string`                 | —                  | Auth token                                                   |
| `tokenScheme`   | `"bearer" \| "apikey"`   | `"bearer"`         | How the token is sent                                        |
| `apiKeyHeader`  | `string`                 | `"x-api-key"`      | Header name when `tokenScheme` is `"apikey"`                 |
| `extraHeaders`  | `Record<string, string>` | —                  | Static headers merged into every request                     |
| `defaultQuery`  | `Record<string, string>` | —                  | Query params appended to every request URL                   |
| `vendor`        | `string`                 | —                  | Vendor label for error messages                              |
| `fetch`         | `typeof fetch`           | `globalThis.fetch` | Override fetch for testing                                   |
| `logger`        | `Logger`                 | no-op              | Structured request/response diagnostics (`debug`)            |
| `errors`        | `ErrorSink`              | no-op              | Reports transport failures + unexpected 5xx                  |
| `retries`       | `number`                 | `2`                | Times a request is sent again (see Retries); `0` is off      |
| `retryDelayMs`  | `number`                 | `300`              | Wait before the first retry; each later one waits 3× as long |
| `retryStatuses` | `readonly number[]`      | none               | HTTP statuses a **read** is sent again on (see Retries)      |

**Retries.** A request is sent again, up to `retries` times, after a transport failure that cannot have applied it twice (the connection never opened, or a read was dropped). By default an HTTP error status is never retried. List statuses in `retryStatuses` (for example `[500, 502, 503, 504]`) to ask for a read again when the server answers one of them. Only `GET` and `HEAD` are repeated on a status: a write may already have been applied, so it fails at once. A status that is not listed (a 4xx, a 429) fails at once too; `Retry-After` is not honoured.

When a request still fails after being sent again, the `ProviderApiError` keeps the last `status` and `details` and its message says how many sends it took, with the vendor's request id when the response carried one (`cf-ray`, else `x-request-id`):

```text
Cloudflare GET /zones/abc/dns_records → 500 (after 3 attempts; cf-ray: 8a1b2c3d4e5f-LHR)
```

Every retry is reported to [`onRetry`](#onretrylistener); for a status the event's `code` is `HTTP 500`.

**Observability seam.** `logger` and `errors` accept the `Logger` / `ErrorSink`
interfaces from [`@theholocron/observability/core`](https://github.com/theholocron/holocron/tree/alpha/observability)
— a seam, not a runtime: the library never calls `Sentry.init` or reads
credentials itself, and both default to a silent no-op when omitted.

```ts
import { SentrySink } from "@theholocron/observability/errors";
import { createLogger } from "@theholocron/observability/logger";

const { logger } = createLogger({ level: "info" });
const errors = new SentrySink();
errors.init({ dsn: process.env.SENTRY_DSN!, release: "my-app@1.0.0", environment: "local", tags: {} });

const client = createRestClient({ baseUrl: "...", token: "...", logger, errors });
```

`errors.captureException` only fires for a transport failure (network error —
`status: 0`) or an unexpected 5xx; a 4xx is left unreported since those are
typically expected and already handled by the caller (a 404 from a
"does this exist" check, etc.).

### `onRetry(listener)`

Hear about every retry any client in this process is about to make, so a command line can say "retrying GitHub, attempt 2 of 3" instead of sitting silent. Returns a function that stops listening.

```ts
const stop = onRetry(({ vendor, attempt, of, code, delayMs }) => {
  console.error(`retrying ${vendor}, attempt ${attempt} of ${of} (${code}, in ${delayMs} ms)`);
});
// …requests…
stop();
```

It is per process, not per client, so nothing has to be handed to each client. It needs one copy of this package in the process (a workspace pins it); with two, the other copy's retries go unseen. A listener that throws is ignored.

### `createResolveToken(config)`

Factory for the standard token resolution used by all holocron plugins. Resolution order:

1. `cliToken` — value from `--token` CLI flag
2. `HOLOCRON_*` env var (e.g. `HOLOCRON_EXAMPLE_TOKEN`)
3. Vendor env var (e.g. `EXAMPLE_TOKEN`)
4. Keyring `<service>.<org>` — only when an org is active (see `ResolveTokenInput.org`)
5. Keyring `<service>` — unnamespaced fallback; backward-compatible default

```ts
import { createResolveToken, AuthError } from "@theholocron/http-client";

export const resolveToken = createResolveToken({
  envName: "HOLOCRON_EXAMPLE_TOKEN",
  vendorEnvName: "EXAMPLE_TOKEN",
  keyringService: "example",
  errorMessage:
    "no Example token found. Pass --token <TOKEN>, set HOLOCRON_EXAMPLE_TOKEN / EXAMPLE_TOKEN, " +
    "or run: holocron auth set example <TOKEN>",
});
```

The returned `resolveToken(input?)` function accepts a `ResolveTokenInput`:

| Field      | Type                                   | Description                                                                                                                                        |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cliToken` | `string`                               | Token from `--token` CLI flag; takes highest priority                                                                                              |
| `env`      | `NodeJS.ProcessEnv`                    | Env vars to consult; defaults to `process.env`                                                                                                     |
| `keyring`  | `(provider: string) => string \| null` | Keyring lookup fn; defaults to the keyring injected by `@theholocron/cli`                                                                          |
| `org`      | `string`                               | Active org name; tries `keyring("<service>.<org>")` before the unnamespaced fallback. Also auto-read from `env["HOLOCRON_ORG"]` when not provided. |

### `ProviderApiError`

Thrown by `createRestClient` on non-2xx responses and transport failures. Carries `status` (HTTP code, `0` for transport failures) and `details` (raw response text).

```ts
import { ProviderApiError } from "@theholocron/http-client";

try {
  await client.request("/endpoint");
} catch (err) {
  if (err instanceof ProviderApiError) {
    console.error(err.status, err.details);
  }
}
```

### `AuthError`

Thrown by `createResolveToken` when no token can be found in any of the four resolution steps.

## License

MIT © [Newton Koumantzelis](https://github.com/iamnewton)
