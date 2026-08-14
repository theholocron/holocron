---
title: HTTP Client (base)
description: Shared HTTP primitives used by all @theholocron clients.
---

`@theholocron/http-client` is the base layer for all other clients in this monorepo. It provides a thin fetch-based REST client with token resolution and normalised error handling.

## Install

```bash
pnpm add @theholocron/http-client
```

## Usage

```ts
import { createRestClient, ProviderApiError } from "@theholocron/http-client";

const rest = createRestClient({
  baseUrl: "https://api.example.com/v1",
  token: process.env.API_TOKEN,
  vendor: "ExampleAPI",
});

try {
  const data = await rest.get<MyResponse>("/resource");
} catch (err) {
  if (err instanceof ProviderApiError) {
    console.error(err.status, err.message);
  }
}
```

## Exports

| Export               | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `createRestClient`   | Factory that returns a typed REST client for a given base URL + token |
| `createResolveToken` | Builds a token resolver that can lazily fetch or refresh credentials  |
| `ProviderApiError`   | Error class thrown on non-2xx responses; includes `status` and body   |
