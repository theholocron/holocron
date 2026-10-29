# `@theholocron/array-utils`

Array validation utilities.

## Installation

```bash
pnpm add @theholocron/array-utils
```

## Usage

```typescript
import { isValid } from "@theholocron/array-utils";

isValid(["a", "b"]); // true  — non-empty array
isValid([]); // false — empty array
isValid(null); // false — null
isValid(undefined); // false — undefined
```

### `isValid(item)`

Returns `true` if the value is a non-null, non-undefined, non-empty array. Returns `false` for `null`, `undefined`, or `[]`.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
