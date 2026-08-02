---
title: String Utils
description: String casing, casting, and pluralisation helpers.
---

`@theholocron/string-utils` wraps `change-case` and `title-case` with a consistent API and adds casting and pluralisation helpers.

## Install

```bash
pnpm add @theholocron/string-utils
```

## Casing

All casing functions take a `string` and return a `string`:

```ts
import {
  toCamelCase,
  toConstantCase,
  toDotCase,
  toKebabCase,
  toLowerCase,
  toPascalCase,
  toPathCase,
  toSentenceCase,
  toSnakeCase,
  toTitleCase,
  toUpperCase,
} from "@theholocron/string-utils";

toCamelCase("hello world"); // "helloWorld"
toKebabCase("Hello World"); // "hello-world"
toSnakeCase("Hello World"); // "hello_world"
toPascalCase("hello world"); // "HelloWorld"
toConstantCase("hello world"); // "HELLO_WORLD"
toTitleCase("hello world"); // "Hello World"
toSentenceCase("hello world"); // "Hello world"
toDotCase("hello world"); // "hello.world"
toPathCase("hello world"); // "hello/world"
toLowerCase("Hello"); // "hello"
toUpperCase("hello"); // "HELLO"
```

## Casting

```ts
import { toArray, toBoolean } from "@theholocron/string-utils";

toArray("foo"); // ["foo"]
toArray(["foo", "bar"]); // ["foo", "bar"]

toBoolean("true"); // true
toBoolean("false"); // false
toBoolean(undefined); // false
```

## Pluralisation

```ts
import { toPlural } from "@theholocron/string-utils";

toPlural(1, "item"); // "item"
toPlural(2, "item"); // "items"
toPlural(2, "box"); // "boxes"
toPlural(2, "city"); // "cities"
toPlural(2, "person", "people"); // "people"
```
