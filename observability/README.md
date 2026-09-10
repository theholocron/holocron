# `@theholocron/node-template`

<!-- holocron:description -->

A modern NodeJS template with pre-configured tools, best practices, and CI/CD setup for rapid project development.

<!-- /holocron:description -->

<!-- holocron:template-only -->

## Getting Started

Use the [Holocron CLI](https://github.com/theholocron/holocron) to scaffold a new repo. It clones the template, renames all placeholder references, and runs `holocron setup` in one step:

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

<!-- /holocron:template-only -->

## Installation

```bash
pnpm install --save-dev @theholocron/node-template
```

## Usage

```typescript
import { doSomething, type SomethingOptions } from "@theholocron/node-template";

function App(options: SomethingOptions) {
  return doSomething(options);
}
```

## Development

<!-- holocron:development -->

This repo uses [pnpm workspaces](https://pnpm.io/workspaces).

```bash
pnpm install       # install all deps
pnpm build         # build all packages
pnpm test          # test all packages
pnpm typecheck     # typecheck all packages
pnpm lint          # lint all packages
```

<!-- /holocron:development -->

## Releases

<!-- holocron:releases -->

Releases are automated via [semantic-release](https://semantic-release.gitbook.io) on push to `main`. All packages are versioned and published in lockstep. See [CHANGELOG.md](CHANGELOG.md) for the release history.

<!-- /holocron:releases -->
