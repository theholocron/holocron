# `@theholocron/object-utils`

Inspect and deep-merge plain objects.

## Installation

```bash
pnpm add @theholocron/object-utils
```

## Usage

```typescript
import { deepMerge, isPlainObject } from "@theholocron/object-utils";

deepMerge({ a: 1, nested: { x: 1 } }, { nested: { y: 2 } });
// { a: 1, nested: { x: 1, y: 2 } }

deepMerge({ tasks: ["a"] }, { tasks: ["b"] });
// { tasks: ["a", "b"] } — arrays concatenate, base first

isPlainObject({}); // true
isPlainObject([]); // false
isPlainObject(new Date()); // false
```

### `isPlainObject(value)`

Returns `true` for a plain `{}` object — not `null`, not an array, not a
class instance (`Object.create(null)` counts too, since its prototype is
also `null`).

### `deepMerge(base, override)`

Deep-merge, `vite`-style: plain objects merge recursively, arrays
concatenate (`base` first), `undefined` in `override` is skipped, every
other `override` value replaces `base`. Neither input is mutated.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
