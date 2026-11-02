---
id: SPEC-0051
status: archived
discussion:
  url: https://discord.com/channels/1303969001822486568/1566620342720401428
---

<!-- editorconfig-checker-disable-file -->
<!-- markdownlint-disable MD013 MD040 -->

<!-- Implemented in: theholocron/clients (refactor/simplify-docs branch) -->
<!-- Prerequisite for: Notes 2, 3 (MDX migration + components) -->

# Astro docs at repo root

Migrates each consuming repo's Astro docs site out of a `docs/` workspace package
and into the repo root. `astro.config.ts` lives at root; `docs/` becomes a non-member
script shim. Implemented first in `clients`; same pattern applies to all repos.

**Depends on:** `@theholocron/astro-config` (shared `defineConfig`) and
`@theholocron/docs-theme` (no-arg `createDocsCollections()`).

---

## Key changes per repo

### `docs/package.json` — script shim, not a workspace member

```json
{
  "name": "@theholocron/<repo>-site",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "astro build --root ..",
    "dev": "astro dev --root ..",
    "preview": "astro preview --root .."
  }
}
```

Remove `'docs'` from `packages:` in `pnpm-workspace.yaml`. The deploy workflow uses
`type: docs` with **no `name:`** so it runs `pnpm -C docs build` rather than
`pnpm --filter` (which requires workspace membership).

### `astro.config.ts` — repo root

Uses `defineConfig` from `@theholocron/astro-config` with `srcDir/outDir/publicDir`
pointing into `docs/`. See themes notes for the full API. Key structural addition:

```ts
export default defineConfig({
  docs: { name, github, sidebar },
  starlight,
  docsTheme,
  srcDir: "./docs/src",
  outDir: "./docs/dist",
  publicDir: "./docs/public",
});
```

### `docs/tsconfig.json`

```json
{
  "extends": "@theholocron/tsconfig/astro",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": [".astro/types.d.ts", "../astro.config.ts", "src/**/*"],
  "exclude": ["dist"]
}
```

`../astro.config.ts` includes the root config for Volar. `@/*` maps to `docs/src/*`
for local MDX imports; `@theholocron/astro-config` wires the same alias in Vite at
build time so both resolve identically.

### `knip.config.ts` — root workspace entry

Without this, knip flags the Astro root deps as unused:

```ts
workspaces: {
  ".": {
    entry: ["holocron.config.ts", "astro.config.ts"],
    project: ["*.ts", "docs/src/**/*.ts"],
  },
}
```

### `turbo.json`

Remove `tsconfig.json` from `globalDependencies` — no root tsconfig exists:

```json
"globalDependencies": ["pnpm-workspace.yaml"]
```

---

## Files touched (clients reference)

| File                         | Change                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `astro.config.ts`            | new at repo root                                                                                               |
| `docs/package.json`          | stripped to script shim, no deps                                                                               |
| `docs/tsconfig.json`         | new — extends astro preset, adds `@/*` alias                                                                   |
| `docs/src/content.config.ts` | `createDocsCollections()` one-liner (see Note 3)                                                               |
| `docs/astro.config.ts`       | deleted                                                                                                        |
| `package.json`               | added `@astrojs/starlight`, `@theholocron/astro-config`, `@theholocron/docs-theme`, `astro` + `docs:*` scripts |
| `pnpm-workspace.yaml`        | removed `'docs'`                                                                                               |
| `turbo.json`                 | removed `tsconfig.json` from `globalDependencies`                                                              |
| `knip.config.ts`             | added root workspace entry                                                                                     |
