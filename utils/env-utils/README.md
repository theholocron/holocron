# `@theholocron/env-utils`

Runtime environment detection and typed env-var parsing.

## Installation

```bash
pnpm add @theholocron/env-utils
pnpm add -D dotenv  # peer dependency, optional
```

## Usage

### Environment detection

```typescript
import { environment, ENVIRONMENTS } from "@theholocron/env-utils";

environment.get(); // "prod" | "qa" | "dev" | "local"
environment.normalize("production"); // "prod"
environment.isDeployed(); // true when qa or prod

// reads ENVIRONMENT → ENV → NODE_ENV in priority order
```

### Env-var parsing

```typescript
import { createEnvParser } from "@theholocron/env-utils";

const { get, map, deprecate } = createEnvParser({ appName: "my-app" });

deprecate("database_url", "db__primary__url");

export const config = map((get) => ({
  port: get("port") ?? 3000,
  db: { url: get("db.primary.url") ?? get("database_url") },
}));
```

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
