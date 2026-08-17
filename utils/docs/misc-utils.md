---
title: Misc Utils
description: Miscellaneous browser utilities.
---

`@theholocron/misc-utils` provides small browser utilities that don't fit elsewhere — currently just Konami Code detection.

## Install

```bash
pnpm add @theholocron/misc-utils
```

## API

### `konami.CODE`

The canonical Konami Code sequence as an array of `KeyboardEvent.code` values:

```ts
import { konami } from "@theholocron/misc-utils";

konami.CODE;
// ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"]
```

### `konami.is(event)`

Returns `true` when the most recent `KeyboardEvent` completes the Konami Code sequence. Maintains internal state across calls — reset automatically on any incorrect key.

```ts
import { konami } from "@theholocron/misc-utils";

document.addEventListener("keydown", (event) => {
  if (konami.is(event)) {
    console.log("Konami Code entered!");
  }
});
```

### Types

```ts
type TKonamiCode = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "KeyA" | "KeyB";
```
