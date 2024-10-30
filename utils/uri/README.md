# URI

Grab details from a URL.

## Installation

```bash
npm install --save-dev @theholocron/utils-uri
```

## Usage

```typescript
import * as uri from "@theholocron/utils-uri";

const test = "https://example.com?id=hello%20world";

uri.getParam(url, "id"); // "hello world");
```
