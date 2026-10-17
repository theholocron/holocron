# `@theholocron/rollup-plugin-transform-template`

Rollup plugin for Vite/Rolldown/tsdown that transforms template files into default-exported string literals so they can be imported directly in TypeScript/JavaScript.

## Installation

```sh
pnpm add -D @theholocron/rollup-plugin-transform-template
```

## Usage

```ts
// vite.config.ts / vitest.config.ts / tsdown.config.ts
import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";

export default defineConfig({
  plugins: [transformTemplate({ dirs: ["/src/commands/setup/templates/"] })],
});
```

Then import template files directly:

```ts
import editorconfigBody from "./editorconfig.md";
import labelerBody from "./github-labeler.yml";
// Both resolve to plain strings at runtime
```

## What gets transformed

| File type                        | Condition                          | Result                                                           |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `.yml`                           | Always                             | Default-exported string                                          |
| `.md`                            | Always                             | Default-exported string                                          |
| Any non-JSON extension           | Path contains a string from `dirs` | Default-exported string                                          |
| `.json`                          | Even inside `dirs`                 | Not transformed — bundlers handle JSON natively as typed objects |
| `.ts` / `.tsx` / `.mts` / `.cts` | Even inside `dirs`                 | Not transformed — source files, not templates                    |
| `node_modules` / virtual ids     | Always                             | Not transformed                                                  |

Query suffixes (`?raw`) are stripped before matching. Extensionless files in `dirs` are transformed, but TypeScript only types `*.yml`/`*.md` imports; cast or declare the others yourself.

## Options

| Option | Type       | Default | Description                                                                                                                |
| ------ | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `dirs` | `string[]` | `[]`    | Path substrings — any file whose resolved id contains one of these strings (and isn't `.json`/`.ts`/`.tsx`) is transformed |

## TypeScript

Add the ambient declarations so `*.yml` and `*.md` imports are typed as strings:

```json
{ "compilerOptions": { "types": ["@theholocron/rollup-plugin-transform-template/client"] } }
```
