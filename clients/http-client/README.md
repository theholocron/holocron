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
  vendor: "Example",   // prefix for error messages
});

const data = await client.request<{ id: string }>("/widgets/42");
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL, trailing slashes trimmed automatically |
| `token` | `string` | — | Auth token |
| `tokenScheme` | `"bearer" \| "apikey"` | `"bearer"` | How the token is sent |
| `apiKeyHeader` | `string` | `"x-api-key"` | Header name when `tokenScheme` is `"apikey"` |
| `extraHeaders` | `Record<string, string>` | — | Static headers merged into every request |
| `defaultQuery` | `Record<string, string>` | — | Query params appended to every request URL |
| `vendor` | `string` | — | Vendor label for error messages |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Override fetch for testing |

### `createResolveToken(config)`

Factory for the standard 4-step token resolution used by all holocron plugins: `--token` flag → `HOLOCRON_*` env var → vendor env var → keyring.

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

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
