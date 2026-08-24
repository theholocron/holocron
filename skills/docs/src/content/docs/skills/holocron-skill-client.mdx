---
title: holocron-skill-client
description: Scaffold a new @theholocron/<slug>-client package in theholocron/clients.
---

Scaffolds a complete HTTP client package in `theholocron/clients` following the canonical patterns.

**Invoke as:** `/holocron-skill-client`

**Trigger:** user asks to add a new HTTP client package to the clients monorepo.

## What it produces

A new `packages/<slug>-client/` directory with:

- `package.json` — pre-wired with all catalog dependencies
- `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `eslint.config.ts`
- `src/client.ts` — `createXxxRestClient()` using `createRestClient` from `@theholocron/http-client`
- `src/index.ts` — public API surface
- `src/types.ts` — shared TypeScript types
- `src/__tests__/` — test stubs using `stubFetch` (DI fetch pattern)

## Post-scaffold checklist

After the skill scaffolds the files, these three steps must be done manually:

1. **Add to `.releaserc.json` `prepareCmd`** — keep alphabetical order. Omitting this freezes the package at its initial version while all others advance.
2. **Set initial `version`** in `package.json` to match the current lockstep version (check the latest GitHub release tag).
3. **Add entry to `codecov.yml`** under `component_management.individual_components`.

## Key conventions

- Use `createRestClient` from `@theholocron/http-client` — no raw `fetch` calls in the client factory
- Use `stubFetch` in tests — DI pattern, no `vi.stubGlobal`
- Reference implementation: `packages/zendesk-client`
