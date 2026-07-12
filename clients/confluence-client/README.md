# @theholocron/confluence-client

TypeScript client for the Confluence REST API.

## Installation

```bash
pnpm add @theholocron/confluence-client
```

## Usage

```ts
import confluence from "@theholocron/confluence-client";

// Pages
const page = await confluence.page.get("123456");
```

> **Note:** This package is in early development. The implementation is being migrated from internal tooling to `@theholocron/http-client` (tracked in [#97](https://github.com/theholocron/clients/issues/97)).

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
