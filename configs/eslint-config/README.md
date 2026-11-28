# ESLint Config

A [ESLint configuration](https://eslint.org/docs/latest/use/configure/configuration-files) for writing well-formed JavaScript and TypeScript.

## Installation

```bash
pnpm add -D @theholocron/eslint-config
```

Install only the peer dependencies for the presets you use (all are optional except the core):

```bash
# Core (always required)
pnpm add -D @eslint/js eslint globals

# TypeScript
pnpm add -D typescript-eslint

# React
pnpm add -D eslint-plugin-react

# Next.js
pnpm add -D @next/eslint-plugin-next

# Node.js
pnpm add -D eslint-plugin-n

# Vitest
pnpm add -D @vitest/eslint-plugin

# Storybook
pnpm add -D eslint-plugin-storybook

# Cypress
pnpm add -D eslint-plugin-cypress
```

## Usage

### Individual presets

Each preset is a separate subpath import so only its plugin loads — importing
`base` won't pull in React or Cypress plugins you don't use.

`base` and `typescript` are available from the root:

```javascript
import { base, typescript } from "@theholocron/eslint-config";

export default [...base(), ...typescript()];
```

`typescript()` is type-aware: `typescript-eslint`'s `recommendedTypeChecked` rules for TypeScript files, read through the
project service, which finds each package's own `tsconfig.json` (no per-package setup). It catches what the plain
recommended set cannot, such as a floating promise or an `any` flowing into a typed parameter. Tool config files
(`*.config.ts`, `vitest.*.ts`), `.holocron/` files, declaration files, examples and tests are linted without type
information, since a package's `tsconfig.json` does not usually include them. Four rules are off because their findings
were noise here: `require-await` (an `async` function with nothing to await is how a method satisfies a Promise-returning
interface), `unbound-method`, `no-base-to-string` and `no-redundant-type-constituents`. A package whose `tsconfig.json`
does not include its source files fails to parse until it does: the error reads `was not found by the project service`
and names the file, and the fix is to add the file's folder to `include` in that package's `tsconfig.json`. (A file that
is not source, such as a script or a generated file, goes in the config's `ignores` instead.) Lint takes roughly two to
three times as long as the plain preset.

`node()` pins `n/no-unsupported-features/node-builtins` and `es-builtins` to the org-wide Node floor (`>=22.0.0`)
instead of reading `engines.node`, so a run with no `package.json` to read (Sentinel's in-memory check) does not fall
back to `>=16.0.0` and flag `Object.hasOwn` or `Response`. `packageJson()` turns both off (a JSON file has no global
scope), and so does `library({ browserPackages })` for the packages it names.

All other presets use subpath imports:

```javascript
import { node } from "@theholocron/eslint-config/node";
import { react } from "@theholocron/eslint-config/react";
import { vitest } from "@theholocron/eslint-config/vitest";
import { next } from "@theholocron/eslint-config/next";
import { storybook } from "@theholocron/eslint-config/storybook";
import { cypress } from "@theholocron/eslint-config/cypress";
```

### Bundles

Bundles combine presets and peer plugins into a single import for common project types. Use these when you want a ready-made config with no manual composition:

```javascript
// React app (base + typescript + react + storybook + vitest)
import { reactApp } from "@theholocron/eslint-config/bundles/react-app";
export default [...reactApp()];

// Next.js app (base + typescript + react + next + vitest)
import { nextApp } from "@theholocron/eslint-config/bundles/next-app";
export default [...nextApp()];

// Node.js app or CLI (base + typescript + node + vitest)
import { nodeApp } from "@theholocron/eslint-config/bundles/node-app";
export default [...nodeApp()];

// Publishable library (base + typescript + vitest)
import { library } from "@theholocron/eslint-config/bundles/library";
export default [...library()];

// With browser-targeted packages (turns off a Node-builtins rule that
// false-positives on navigator/sessionStorage/KeyboardEvent/…):
export default [...library({ browserPackages: ["utils/browser-utils/src"] })];
```

Add project-specific configs after the bundle — they are merged in order:

```javascript
import { reactApp } from "@theholocron/eslint-config/bundles/react-app";
import { cypress } from "@theholocron/eslint-config/cypress";

export default [...reactApp(), ...cypress(), { settings: { react: { version: "detect" } } }];
```

## ESLint version

Requires ESLint v10. The `react` preset wraps `eslint-plugin-react` with `@eslint/compat`'s `fixupConfigRules` to patch APIs removed in ESLint v10 — no extra config needed.
