# Typescript Config

A [Typescript configuration](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) for writing typed Javascript.

## Installation

```bash
npm install --save-dev @theholocron/tsconfig
```

## Usage

In your projects `tsconfig.json` add the following:

```json
{
	"extends": "@theholcron/tsconfig/<config>/tsconfig.json"
}
```

There are 4 different base configurations to choose from:

1. NextJS (`@theholcron/tsconfig/nextjs/tsconfig.json`)
2. Node 14 (`@theholcron/tsconfig/node14/tsconfig.json`)
3. Node 18 (`@theholcron/tsconfig/node18/tsconfig.json`)
4. Node Next (`@theholcron/tsconfig/node-next/tsconfig.json`)
