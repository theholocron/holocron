# Lint Staged Config

A [lint-staged configuration](https://github.com/lint-staged/lint-staged#configuration) for running linters on Git-staged files.

## Installation

```bash
npm install --save-dev @theholocron/lint-staged-config lint-staged husky
```

## Usage

### 1. Set up Husky

```bash
npx husky init
```

### 2. Wire lint-staged into the pre-commit hook

Replace the contents of `.husky/pre-commit` with:

```bash
pnpm exec lint-staged
```

Then create a `lint-staged.config.js` at your project root:

```js
export { default } from "@theholocron/lint-staged-config";
```

## What runs on staged files

| File pattern               | Commands                        |
| -------------------------- | ------------------------------- |
| `*.{js,jsx}`               | `prettier --write`, `eslint`    |
| `*.{ts,tsx}`               | `prettier --write`, `eslint`    |
| `*.css`                    | `stylelint --fix`               |
| `*.scss`                   | `stylelint --syntax=scss --fix` |
| `*.{md,mdx}`               | `prettier --write`              |
| `*.{png,jpeg,jpg,gif,svg}` | `imagemin-lint-staged`          |
| `package.json`             | `sort-package-json`             |
