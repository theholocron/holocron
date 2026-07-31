---
title: Storage Utils
description: Namespaced session storage.
---

`@theholocron/storage-utils` provides a namespaced session storage abstraction. Apps register under a name and read/write isolated storage slices without key collisions.

## Install

```bash
npm i @theholocron/storage-utils
```

## API

### `storage.session`

A pre-built namespaced session storage instance (under the `@theholocron` namespace).

```ts
import { storage } from "@theholocron/storage-utils";

// Register your app first
storage.session.registerApp("my-app");

// Write a value (dot-separated key supports nesting)
storage.session.sendTo("user.name", "Alice");

// Read a namespace
const data = storage.session.getFrom("my-app");

// Read everything
const all = storage.session.getAll();

// Remove a namespace
storage.session.removeFrom("my-app");

// Clear all storage
storage.session.clear();
```

### `TSessionStorage` interface

```ts
interface TSessionStorage {
  registerApp: (appName: string) => void;
  sendTo: (key: string, value: unknown) => void;
  getAll: () => object;
  getFrom: (key: string) => object | null;
  removeFrom: (key: string) => void;
  clear: () => void;
}
```

## Notes

This package uses the browser `sessionStorage` API. It degrades gracefully in environments where `sessionStorage` is unavailable.
