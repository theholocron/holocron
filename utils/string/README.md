# Strings

Convert a string to any case or case to a different data type.

## Installation

```bash
npm install --save-dev @theholocron/utils-string
```

## Usage

```typescript
import * as str from "@theholocron/utils-string";

const test = "hello world";

// casing
str.toCamelCase(test); // helloWorld
str.toConstantCase(test); // HELLO_WORLD"
str.toDotCase(test); // hello.world
str.toKebabCase(test); // hello-world
str.toLowerCase(test); // hello world
str.toPascalCase(test); // HelloWorld
str.toPathCase(test); // hello/world
str.toSentenceCase(test); // Hello world
str.toSnakeCase(test); // hello_world
str.toTitleCase(test); // Hello World
str.toUpperCase(test); // HELLO WORLD

// casting
str.toArray(test); // ["hello world"]);
str.toArray([test]); // ["hello world"]);
str.toBoolean("true"); // true;
str.toBoolean(""); // false;
```

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utilities/) for more information.
