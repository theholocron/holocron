# `@theholocron/storage-utils`

Namespaced session storage utilities.

## Installation

```bash
pnpm add @theholocron/storage-utils
```

## Usage

```typescript
import { storage } from "@theholocron/storage-utils";

// Create a namespaced store for your app
const store = storage.session.create("my-namespace");

store.registerApp("my-app");

// Write data (supports dot-notation for nested keys)
store.sendTo("user.name", "Newton");
store.sendTo("user.role", "admin");

// Read data
store.getFrom("user"); // { name: "Newton", role: "admin" }
store.getAll(); // full storage object

// Remove a key
store.removeFrom("user.role");

// Clear all data for this namespace
store.clear();
```

### `storage.session.create(namespace?)`

Creates a namespaced session storage instance. The namespace defaults to `"theholocron"` (stored as `@theholocron` in `sessionStorage`).

The returned object exposes:

| Method                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `registerApp(appName)` | Register an app within the namespace         |
| `sendTo(key, value)`   | Write a value (dot-notation for nested keys) |
| `getFrom(key)`         | Read a value by key                          |
| `getAll()`             | Return the full storage object               |
| `removeFrom(key)`      | Delete a key                                 |
| `clear()`              | Clear all data for the namespace             |

> **Note:** Requires a browser environment — falls back gracefully when `sessionStorage` is unavailable.

## Documentation

Check out [The Holocron Archive](https://docs.theholocron.dev/projects/utils/) for more information.
