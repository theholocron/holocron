# ESLint Config

A [ESLint configuration](https://eslint.org/docs/latest/use/configure/configuration-files) for writing well-formed JavaScript and TypeScript.

## Installation

```bash
npm install --save-dev @theholocron/eslint-config
```

Install only the peer dependencies for the presets you use (all are optional):

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

Compose the presets your project needs in `eslint.config.js`:

```javascript
import { base, typescript, react, node, vitest } from "@theholocron/eslint-config";

export default [...base(), ...typescript(), ...react(), ...vitest()];
```

Available presets: `base`, `typescript`, `react`, `next`, `node`, `vitest`, `storybook`, `cypress`.

### Bundles

Bundles combine presets and peer plugins into a single import for common project types:

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
