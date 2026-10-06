# `@theholocron/misc-utils`

Miscellaneous utilities.

## Installation

```bash
pnpm add @theholocron/misc-utils
```

## Usage

### `errorMessage(err)`

Stringifies a caught value for display — `err.message` for a real
`Error`, `String(err)` for anything else. `catch` blocks only ever get
`unknown` in TypeScript; this is the one line nearly every one of them
needs.

```typescript
import { errorMessage } from "@theholocron/misc-utils";

try {
  doSomething();
} catch (err) {
  console.error(errorMessage(err));
}
```

### Konami code detector

```typescript
import { konami } from "@theholocron/misc-utils";

// The classic sequence: ↑ ↑ ↓ ↓ ← → ← → B A
console.log(konami.CODE);
// ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
//  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"]

window.addEventListener("keydown", (event) => {
  if (konami.is(event)) {
    console.log("Konami code entered!");
  }
});
```

### `konami.is(event)`

Checks whether the given `KeyboardEvent` continues the Konami code sequence. Returns `true` when the full sequence is completed; resets the internal index on any incorrect key.

### `konami.CODE`

The Konami code sequence as a readonly `TKonamiCode[]`.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
