---
title: Utils
description: Lightweight TypeScript utility packages for arrays, strings, dates, environment detection, and more.
sidebar:
  hidden: true
---

`@theholocron/utils` is a pnpm monorepo of small, focused TypeScript utility packages. Each package is published independently and can be installed on its own.

## Packages

| Package                                             | Description                                             |
| --------------------------------------------------- | ------------------------------------------------------- |
| [`@theholocron/array-utils`](./array-utils)         | Validate and manipulate arrays                          |
| [`@theholocron/date-time-utils`](./date-time-utils) | Date and time helpers                                   |
| [`@theholocron/env-utils`](./env-utils)             | Runtime environment detection and typed env-var parsing |
| [`@theholocron/location-utils`](./location-utils)   | Browser geolocation wrapper                             |
| [`@theholocron/misc-utils`](./misc-utils)           | Miscellaneous browser utilities                         |
| [`@theholocron/storage-utils`](./storage-utils)     | Namespaced session storage                              |
| [`@theholocron/string-utils`](./string-utils)       | String casing, casting, and pluralisation               |
| [`@theholocron/uri-utils`](./uri-utils)             | URL search-parameter helpers                            |

## Install

Each package is published independently to npm:

```bash
pnpm add @theholocron/string-utils
```

All packages follow the same lockstep versioning — see the
[releases page](https://github.com/theholocron/utils/releases) for the current version.
