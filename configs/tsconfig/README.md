# TypeScript Config

A [TypeScript configuration](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) for writing typed JavaScript.

## Installation

```bash
pnpm add -D @theholocron/tsconfig
```

## Usage

In your project `tsconfig.json`, extend one of the two base configurations:

### Next.js

```json
{
  "extends": "@theholocron/tsconfig/nextjs"
}
```

### Node LTS

Targets the current Node LTS feature set. All theholocron projects use this:

```json
{
  "extends": "@theholocron/tsconfig/node-lts"
}
```

### React

Targets browser environments for React component libraries and apps. Sets `DOM` lib, `ESNext` module with `bundler` resolution, and `react-jsx` transform — no manual overrides needed for Vite-based projects:

```json
{
  "extends": "@theholocron/tsconfig/react"
}
```
