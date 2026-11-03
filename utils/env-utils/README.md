# `@theholocron/env-utils`

Runtime environment detection and typed env-var parsing.

## Installation

```bash
pnpm add @theholocron/env-utils
pnpm add dotenv  # optional peer: install it if you import the package entry; `/lookup` does not need it
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

### Precedence chains

`firstEnv(env, names, fallback?)` returns the first variable in `names` that is set and non-empty, else `fallback`:

```typescript
import { createEnvLookup, firstEnv } from "@theholocron/env-utils";

const env = createEnvLookup();
const dsn = firstEnv(env, ["MYAPP_SENTRY_DSN", "SENTRY_DSN"], DEFAULT_DSN);
```

`withEnvPrefix(env, prefix)` wraps an `EnvLookup` so `get("KEY")` tries `<prefix>_KEY` first, then `KEY`. The prefix is matched with exact case, so pass it in upper case. Name the variable once and let the namespaced override win:

```typescript
import { createEnvLookup, withEnvPrefix } from "@theholocron/env-utils";

const env = withEnvPrefix(createEnvLookup(), "MYAPP");
env.get("SENTRY_DSN"); // MYAPP_SENTRY_DSN, else SENTRY_DSN
```

### Importing without side effects

Importing the package reads no file: `process.env` is not changed because the package was imported. A `.env` in the working directory is loaded only when `DotenvLoader.load()` runs, which `createEnvParser` does when you do not pass your own `loader`, and only once per loader (variables already set win). `createEnvLookup`, `firstEnv` and `withEnvPrefix` only read `process.env`. Libraries that only read variables can import from the `/lookup` subpath, which does not import `dotenv`, so `dotenv` stays an optional peer dependency that you only install when you import the package entry:

```typescript
import { createEnvLookup, firstEnv } from "@theholocron/env-utils/lookup";
```

Before 2.0.0 the entry ran `import "dotenv/config"`, which loaded a `.env` from the working directory on import. If you relied on that, call `createEnvParser` or `dotenv.config()` yourself.

### Logging

Debug output (key-loaded counts, missing-key warnings, deprecation notices) goes to `console.info`/`console.warn` by default. Pass an `EnvLogger` (any object shaped `{ info(message, meta?), warn(message, meta?) }`) to route it elsewhere:

```typescript
const { get } = createEnvParser({ appName: "my-app", logger: myLogger });
```

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/holocron/utils/env-utils/) for more information.
