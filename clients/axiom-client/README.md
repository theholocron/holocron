# @theholocron/axiom-client

A TypeScript client for the Axiom API — wraps the dataset and current-user endpoints.

## Installation

```bash
pnpm add @theholocron/axiom-client
```

## Usage

```ts
import { createAxiomClient } from "@theholocron/axiom-client";

const client = createAxiomClient({
  token: process.env.AXIOM_TOKEN!,
});

// Get the current token's user (token check)
const me = await client.user.me();

// Find or create a dataset
const dataset = await client.datasets.get("my-logs").catch(() => client.datasets.create({ name: "my-logs" }));
console.log(dataset.id);
```

## API

### `createAxiomClient(opts)`

| Option    | Type           | Default                | Description                   |
| --------- | -------------- | ---------------------- | ----------------------------- |
| `token`   | `string`       | —                      | Axiom API token               |
| `baseUrl` | `string`       | `https://api.axiom.co` | Override base URL for testing |
| `fetch`   | `typeof fetch` | `globalThis.fetch`     | Override fetch for testing    |

Returns a client with two resource namespaces:

#### `client.user`

| Method | Description                           |
| ------ | ------------------------------------- |
| `me()` | `GET /v2/user` — current token's user |

#### `client.datasets`

| Method          | Description                            |
| --------------- | -------------------------------------- |
| `get(name)`     | `GET /v2/datasets/{name}` — fetch one  |
| `create(input)` | `POST /v2/datasets` — create a dataset |

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
