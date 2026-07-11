# ESLint Config

A [ESLint configuration](https://eslint.org/docs/latest/use/configure/configuration-files) for writing well-formed JavaScript and TypeScript.

## Installation

```bash
npm install --save-dev @theholocron/eslint-config
```

Install only the peer dependencies for the presets you use (all are optional except the core):

```bash
# Core (always required)
npm install --save-dev @eslint/js eslint globals

# TypeScript
npm install --save-dev typescript-eslint

# React
npm install --save-dev eslint-plugin-react

# Next.js
npm install --save-dev @next/eslint-plugin-next

# Node.js
npm install --save-dev eslint-plugin-n

# Vitest
npm install --save-dev @vitest/eslint-plugin

# Storybook
npm install --save-dev eslint-plugin-storybook

# Cypress
npm install --save-dev eslint-plugin-cypress
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
// React app (base + typescript + react + vitest)
import reactApp from "@theholocron/eslint-config/bundles/react-app";
export default reactApp();

// Next.js app (base + typescript + react + next + vitest)
import nextApp from "@theholocron/eslint-config/bundles/next-app";
export default nextApp();

// Node.js app or CLI (base + typescript + node + vitest)
import nodeApp from "@theholocron/eslint-config/bundles/node-app";
export default nodeApp();

// Publishable library (base + typescript + vitest)
import library from "@theholocron/eslint-config/bundles/library";
export default library();
```
