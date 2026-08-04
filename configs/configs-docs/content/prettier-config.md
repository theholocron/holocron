---
title: Prettier Config
description: Shared Prettier formatting rules for theholocron projects.
---

`@theholocron/prettier-config` provides the shared Prettier configuration used across all theholocron packages.

## Install

```bash
pnpm add -D @theholocron/prettier-config prettier
```

## Usage

In `package.json`:

```json
{
	"prettier": "@theholocron/prettier-config"
}
```

Or in `.prettierrc.cjs`:

```js
module.exports = require("@theholocron/prettier-config");
```
