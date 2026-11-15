# `@theholocron/codecov-client`

TypeScript client for the [Codecov REST API v2](https://docs.codecov.com/reference/overview).

## Install

```bash
pnpm add @theholocron/codecov-client
```

## Usage

```ts
import { createCodecovClient } from "@theholocron/codecov-client";

const codecov = createCodecovClient({ token: process.env.CODECOV_API_TOKEN! });

const repo = await codecov.repos.get("github", "theholocron", "holocron");
const owner = await codecov.owners.get("github", "theholocron");
```

The token is a Codecov API (personal access) token, sent as `Authorization: Bearer`. A repository _upload_ token is a
different credential, and the REST API documents only the personal token.
