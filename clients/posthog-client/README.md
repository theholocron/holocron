# @theholocron/posthog-client

A TypeScript client for the PostHog management API — wraps the personal API key endpoints for users and projects.

## Installation

```bash
pnpm add @theholocron/posthog-client
```

## Usage

```ts
import { createPostHogClient } from "@theholocron/posthog-client";

const client = createPostHogClient({
  token: process.env.POSTHOG_PERSONAL_API_KEY!,
  // host: "https://eu.posthog.com", // EU cloud
  // host: "https://posthog.mycompany.com", // self-hosted
});

// Get the current user
const user = await client.users.me();
console.log(user.organization.slug);

// List projects
const { results } = await client.projects.list();

// Find or create a project
const found = results.find((p) => p.name === "my-app");
const project = found ?? (await client.projects.create({ name: "my-app" }));
console.log(project.api_token); // phc_* tracking token
```

## API

### `createPostHogClient(opts)`

| Option    | Type           | Default                   | Description                                                 |
| --------- | -------------- | ------------------------- | ----------------------------------------------------------- |
| `token`   | `string`       | —                         | Personal API key (`phx_*`) from PostHog account settings    |
| `host`    | `string`       | `https://app.posthog.com` | PostHog host — US cloud, EU cloud, or self-hosted URL       |
| `baseUrl` | `string`       | —                         | Override base URL for testing; takes precedence over `host` |
| `fetch`   | `typeof fetch` | `globalThis.fetch`        | Override fetch for testing                                  |

Returns a client with two resource namespaces:

#### `client.users`

| Method | Description                          |
| ------ | ------------------------------------ |
| `me()` | `GET /api/users/@me/` — current user |

#### `client.projects`

| Method          | Description                                      |
| --------------- | ------------------------------------------------ |
| `list()`        | `GET /api/projects/` — all accessible projects   |
| `create(input)` | `POST /api/projects/` — create a project by name |

The `api_token` on each project is the client-side tracking token (`phc_*`) used with `posthog-js` / `posthog-node`.

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
