# TypeScript Config

A [TypeScript configuration](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) for writing typed JavaScript.

## Installation

```bash
npm install --save-dev @theholocron/tsconfig
```

## Usage

In your project `tsconfig.json`, extend one of the four base configurations:

### Next.js

```json
{
  "extends": "@theholocron/tsconfig/nextjs/tsconfig.json"
}
```

### Node (LTS / current)

Targets the latest Node.js LTS features:

```json
{
  "extends": "@theholocron/tsconfig/node-next/tsconfig.json"
}
```

### Node 18

For projects that must support Node 18:

```json
{
  "extends": "@theholocron/tsconfig/node18/tsconfig.json"
}
```

### Node 14 (legacy)

For projects still on Node 14:

```json
{
  "extends": "@theholocron/tsconfig/node14/tsconfig.json"
}
```

> **Note:** New projects should target `node-next`. `node14` is provided for
> legacy compatibility only. All theholocron projects require Node 22+.
