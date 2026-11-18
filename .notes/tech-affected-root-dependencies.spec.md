---
status: draft
issue: theholocron/holocron#2407
blocked-by: []
related:
  - theholocron/holocron#1200
  - theholocron/holocron#1202
---

# The root's workspace dependencies make every package affected

Follow-up to question 1 of `tech-affected-ci`, which assumed the cause was the `@theholocron/cli` entry in leaf
packages. The measurement in #2407 shows it is the root package.

## Problem

Affected-only CI selects a package when it, or anything it depends on, changed. Today a change to `cli/cli` selects all
88 packages, so "only run what changed" is nominal for the commonest kind of change.

Measured with turbo 2.11.11 on `alpha` (`turbo ls --filter="...@theholocron/cli"`):

| Case                                                            | Packages a CLI change selects             |
| --------------------------------------------------------------- | ----------------------------------------- |
| As it is                                                        | 88 of 88                                  |
| The root's `@theholocron/cli` entry removed                     | 88                                        |
| All 34 `@theholocron/*` workspace entries removed from the root | 25 (the CLI and its 24 direct dependents) |

The cause: turbo gives a package with no internal dependencies (`@theholocron/tsconfig`) an edge to the root package
(`turbo query` shows `tsconfig`'s direct dependency is `//`), and the root lists 34 workspace packages as dependencies.
So every package reaches the CLI, and every plugin and config, through `leaf -> config -> tsconfig -> root`.

Other findings:

- Turbo does not follow `peerDependencies`. Removing only a plugin's devDependency on the CLI, with its peer kept, took it
  out of the CLI's closure. The plugins' devDependency counts; their peer entry does not.
- A change to `eslint-config` still selects 73 packages with the root edges gone. That is correct: they all use it.
- The 26 manifests that name the CLI are not the cause. Removing them one by one would change nothing while the root
  edges stay.

## Why the root lists them

- The CLI loads a plugin by name from the working directory (`createRequire(process.cwd() + "/")` in
  `cli/kyber/src/plugins/default-importer/`). `holocron.config.ts` at the root names the providers, so every plugin must
  resolve from the root's `node_modules`.
- The root's own tooling imports the shared configs (`eslint-config`, `prettier-config`, `commitlint-config`,
  `tsconfig`, `tsdown-config`, and so on).
- The `holocron` script is already `node cli/cli/dist/cli.mjs`, so the bin does not need the dependency.

## Goals and non-goals

Goals: a change that touches one leaf selects that leaf and its real dependents; a change to the CLI selects the CLI and
what imports it (25 packages today), not the repository.

Non-goals: changing how plugins are resolved for a repo that is not this one; changing the 24 packages' own dependencies;
changing what a shared config change selects.

## Options

None is chosen.

1. **Keep the packages installed at the root, but not as workspace dependencies turbo can see.** Candidates: a `link:` or
   `file:` specifier, or a pnpm `dependenciesMeta` or hoisting setting. Needs a spike: whether turbo still matches the
   name, whether pnpm still links the package, and whether `holocron` resolves its plugins from the root.
2. **Move the root's tooling dependencies into a private workspace package** (for example `tools/`) that the root does not
   depend on. Plugins would then not resolve from the root, so the CLI's lookup would have to start from that package or
   read a configured directory. This changes the CLI, not only the manifests.
3. **Cut the implicit edge.** Turbo has no setting for it that I found. Not verified: a newer turbo release, or a
   `turbo.json` option.
4. **Accept it and scope `--affected` differently** (for example, treat a CLI change as a full run on purpose and say so
   in #1202's acceptance). Cheapest; it leaves the saving small.

## Spike (before choosing)

1. In a scratch worktree, replace the root's 34 entries with option 1's specifier and run `turbo ls --filter="...@theholocron/cli"`
   again. The goal is 25.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm exec holocron show config` and one `holocron run` task to
   show the plugins still resolve.
3. Run `turbo run test:unit --affected --dry=json` with a one-file change in `cli/cli`, to show `--affected` follows the
   same graph as `--filter`. Not verified today.
4. Check `knip`, `probe deps check` and the catalog rules still pass: the check treats a hard-coded workspace version as
   a failure.

## Open questions

1. Which option? Decide after the spike.
2. Does the root need `@theholocron/cli` itself, now that the `holocron` script runs the built file? It is needed if a
   root config imports `defineConfig` from it.
3. What does the 24-package list (the CLI's direct dependents, mostly plugins) need to keep? Left alone here; the closure
   they make is real and small.
4. Is `turbo.json`'s `globalDependencies` still right once the root's dependencies stop counting, so a root manifest
   change still triggers a full run? See `tech-affected-ci`.

## Not verified

- That the root can drop its workspace entries without breaking `pnpm exec holocron`, the hooks in `.husky/` or the root
  `eslint.config.ts`.
- That `--affected` uses the same graph as `--filter`.
- The turbo behaviour above on any version other than 2.11.11.
