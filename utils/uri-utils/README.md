# `@theholocron/uri-utils`

URL and search parameter utilities.

## Installation

```bash
pnpm add @theholocron/uri-utils
```

## Usage

```typescript
import { getParam } from "@theholocron/uri-utils";

const url = "https://example.com/search?q=hello&page=2";

getParam(url, "q"); // "hello"
getParam(url, "page"); // "2"
getParam(url, "sort"); // null
```

### `getParam(url, param)`

Extracts a single query parameter from a URL string. Returns the parameter value as a string, `null` if the parameter is not present, or `""` if the URL has no query string.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
