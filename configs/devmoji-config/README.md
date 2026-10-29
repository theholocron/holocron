# @theholocron/devmoji-config

Shared [devmoji](https://github.com/folke/devmoji) configuration for theholocron repos. Provides custom emoji mappings for conventional commits and exposes `defineConfig` for repo-specific overrides.

## Installation

```bash
pnpm add -D @theholocron/devmoji-config
```

## Usage

Create `devmoji.config.cjs` at the repo root (`.cjs` is required because devmoji uses `require()` and theholocron repos set `"type": "module"`):

```js
/* eslint-disable */
const { defineConfig } = require("@theholocron/devmoji-config");
module.exports = defineConfig();
```

With repo-specific overrides:

```js
/* eslint-disable */
const { defineConfig } = require("@theholocron/devmoji-config");
module.exports = defineConfig({
  types: ["wip"],
  devmoji: [{ code: "feat", emoji: "sparkles" }],
});
```

Overrides are **appended** to the defaults — they do not replace them. To fully override an entry, define it before the defaults by not calling `defineConfig` and building the config manually.

## Default mappings

| Type             | Emoji    | Notes                                     |
| ---------------- | -------- | ----------------------------------------- |
| `feat`           | 💥       | New feature                               |
| `fix`            | 🐛       | Bug fix (devmoji default)                 |
| `fail`           | 💩       | Catastrophic failure or emergency hot fix |
| `docs`           | 📚       | Documentation (devmoji default)           |
| `chore`          | 🔧       | Maintenance (devmoji default)             |
| `chore(release)` | 🚀       | Release (devmoji default)                 |
| `ci`             | 👷       | CI changes (devmoji default)              |
| `refactor`       | ♻️       | Refactor (devmoji default)                |
| `test`           | 🚨       | Tests (devmoji default)                   |
| `perf`           | ⚡       | Performance (devmoji default)             |
| `build`          | 📦       | Build changes (devmoji default)           |
| `config`         | ⚙️       | Config file changes                       |
| `lint`           | _(none)_ | Extra accepted type; no emoji mapped      |

## Husky integration

`holocron setup` writes `.husky/prepare-commit-msg` with the devmoji hook automatically. To add it manually:

```bash
npx husky add .husky/prepare-commit-msg "npx devmoji -e --lint"
```

## Releases

Versioned in lockstep with all other `@theholocron/` config packages. See the [releases page](https://github.com/theholocron/configs/releases).
