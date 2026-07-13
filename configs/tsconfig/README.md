# TypeScript Config

A [TypeScript configuration](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) for writing typed JavaScript.

## Installation

```bash
npm install --save-dev @theholocron/tsconfig
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
