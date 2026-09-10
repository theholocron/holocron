---
title: Getting Started
description: How to use the Node template to start a new library.
---

## Use this template

Use the [Holocron CLI](https://github.com/theholocron/holocron) to scaffold a new Node.js library. It clones the template, renames all placeholder references, and runs `holocron setup` in one step:

```bash
npx @theholocron/cli new node my-library \
  --description "My library description" \
  --homepage "https://my-library.example.com" \
  --agent claude
```

This will:

1. Create `theholocron/my-library` from this template on GitHub
2. Replace all `node-template` references with `my-library` throughout the repo
3. Run `pnpm install`
4. Run `holocron setup` to configure branch protection, labels, workflows, and repo settings

### Manual clone

If you prefer to set things up yourself:

```bash
git clone https://github.com/theholocron/node-template.git my-library
cd my-library
pnpm install
```

## Development

```bash
pnpm build     # compile the library
pnpm test      # run tests
```

## Scripts

| Script               | Description                  |
| -------------------- | ---------------------------- |
| `pnpm build`         | Compile the library          |
| `pnpm test`          | Run tests                    |
| `pnpm test:coverage` | Run tests with coverage      |
| `pnpm typecheck`     | Run TypeScript type-checking |
| `pnpm lint`          | Run ESLint                   |
