---
title: "config show"
description: Print the fully-resolved Holocron configuration as JSON.
---

```bash
holocron config show [--cwd <path>]
```

Loads and resolves `holocron.config.ts` (or `.json`), then prints the result as formatted JSON to stdout. Useful for debugging config parsing, provider resolution, and option merging.

## Output

The output is the fully-resolved `ResolvedHolocronConfig` object — provider short names are expanded to their full package names, entries are normalized to canonical tuple form, and defaults are applied.

```bash
holocron config show
```

Example output:
```json
{
  "name": "my-project",
  "description": "Short description",
  "repo": {
    "name": "my-org/my-project",
    "protection": "balanced",
    "topics": ["typescript"]
  },
  "providers": {
    "source": {
      "cardinality": "single",
      "tuple": {
        "provider": "github",
        "packageName": "@theholocron/holocron-plugin-github",
        "options": {}
      }
    }
  },
  "apps": [],
  "doctor": {},
  "workflows": ["lint", "test"]
}
```

## Options

| Option | Description |
| --- | --- |
| `--cwd <path>` | Directory to search for config (default: `process.cwd()`) |
