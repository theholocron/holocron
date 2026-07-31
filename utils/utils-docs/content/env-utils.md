---
title: Environment Utils
description: Runtime environment detection and typed env-var parsing.
---

`@theholocron/env-utils` provides two complementary APIs: runtime environment detection and a typed `createEnvParser` factory for structured env-var access.

## Install

```bash
npm i @theholocron/env-utils
```

## Environment detection

### `environment`

Detects the current runtime environment from `ENVIRONMENT`, `ENV`, or `NODE_ENV`.

```ts
import { environment } from "@theholocron/env-utils";

environment.get(); // "local" | "dev" | "qa" | "prod"
environment.isDeployed(); // true when env is "qa" or "prod"
environment.normalize("production"); // "prod"
```

### Constants

```ts
import {
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
  DEPLOYED_ENVIRONMENTS,
} from "@theholocron/env-utils";

ENVIRONMENTS; // ["local", "dev", "qa", "prod"]
DEFAULT_ENVIRONMENT; // "prod"
DEPLOYED_ENVIRONMENTS; // Set { "qa", "prod" }
```

### `DotenvLoader`

Default loader strategy that reads `process.env`. Pass a custom loader to `createEnvParser` to swap it out.

## Typed env parsing

### `createEnvParser(options)`

Creates a typed env parser. All four key forms resolve to the same value for nested keys:

```ts
import { createEnvParser } from "@theholocron/env-utils";

const parser = createEnvParser({ appName: "my-app" });

// All equivalent for nested keys
parser.get("SERVICE__DB__URL");
parser.get("service__db__url");
parser.get("service.db.url");

// Map to a typed config object
export const config = parser.map((get) => ({
  port: get("port") ?? 3000,
  database: {
    url: get("db.primary.url") ?? get("database_url"),
  },
}));
```

### Options

| Option        | Type        | Default        | Description                                               |
| ------------- | ----------- | -------------- | --------------------------------------------------------- |
| `appName`     | `string`    | —              | Display name for debug output                             |
| `loader`      | `EnvLoader` | `DotenvLoader` | Custom env-var loader strategy                            |
| `parseValues` | `boolean`   | `true`         | Coerce `"true"`/`"false"`/numeric strings to native types |
