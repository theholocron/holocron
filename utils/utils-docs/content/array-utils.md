---
title: Array Utils
description: Validate and manipulate arrays.
---

`@theholocron/array-utils` provides a small set of array validation helpers.

## Install

```bash
npm i @theholocron/array-utils
```

## API

### `isValid(item)`

Returns `true` if `item` is a non-null, non-undefined, non-empty array.

```ts
import { isValid } from "@theholocron/array-utils";

isValid([1, 2, 3]); // true
isValid([]); // false
isValid(null); // false
isValid(undefined); // false
```
