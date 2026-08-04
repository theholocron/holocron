---
title: Browserslist Config
description: Shared Browserslist target browser list for theholocron projects.
---

`@theholocron/browserslist-config` provides the shared Browserslist target list used across all theholocron front-end projects.

## Install

```bash
pnpm add -D @theholocron/browserslist-config
```

## Usage

Add to your `package.json`:

```json
{
	"browserslist": ["extends @theholocron/browserslist-config"]
}
```

Or in a `.browserslistrc` file:

```
extends @theholocron/browserslist-config
```
