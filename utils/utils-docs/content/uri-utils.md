---
title: URI Utils
description: URL search-parameter helpers.
---

`@theholocron/uri-utils` provides lightweight helpers for reading values from URLs.

## Install

```bash
npm i @theholocron/uri-utils
```

## API

### `getParam(url, param)`

Returns the value of a named query parameter from a URL string, or `null` if the parameter is absent.

```ts
import { getParam } from "@theholocron/uri-utils";

getParam("https://example.com?page=2&limit=10", "page"); // "2"
getParam("https://example.com?page=2&limit=10", "sort"); // null
getParam("https://example.com", "page"); // ""
```
