# `@theholocron/json-utils`

Stringify JSON with a trailing newline, preserving a file's own indent and line endings.

## Installation

```bash
pnpm add @theholocron/json-utils
```

## Usage

```typescript
import { detectIndent, stringifyJson } from "@theholocron/json-utils";

stringifyJson({ a: 1 });
// '{\n  "a": 1\n}\n' — 2 spaces, one trailing newline

// rewrite a file without reformatting it: reuse its tabs / 4 spaces / CRLF
const original = await readFile("package.json", "utf8");
const pkg = JSON.parse(original);
pkg.version = "2.0.0";
await writeFile("package.json", stringifyJson(pkg, { like: original }));

detectIndent('{\n\t"a": 1\n}'); // "\t"
```

### `stringifyJson(value, options?)`

`JSON.stringify` pretty-printed, ending in exactly one newline.

- `indent` — a number of spaces or a literal string (`"\t"`). Default `2`.
- `like` — the existing file's text. Its detected indent and line endings
  (`\n` vs `\r\n`) are used instead of `indent`; it falls back to `indent` when
  nothing can be detected (empty or single-line input).

Throws a `TypeError` for a value with no JSON representation (`undefined`, a
function, a symbol).

### `detectIndent(text)`

The leading space of the first indented line (spaces or a tab), or
`undefined` for an empty, single-line or unindented document.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
