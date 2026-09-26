/**
 * The org's canonical prettier ignore-pattern list for a central Sentinel
 * check (holocron#769/#819) — the `PRETTIER_CONFIG` object itself doesn't
 * need a home here, since `@theholocron/prettier-config`'s default export
 * already *is* one canonical, importable config (the same "one config,
 * not N copies" reasoning `@theholocron/commitlint-config` established for
 * commit-message linting, and `ALEX_CONFIG` established for inclusive
 * language) — only the ignore list is a Sentinel-specific decision that
 * belongs alongside `ALEX_IGNORE_PATTERNS`, not inside the config package.
 *
 * Reuses `ALEX_IGNORE_PATTERNS`' own entries (`.github/*`, `CHANGELOG.md`,
 * `LICENSE` all independently confirmed to fail a real `prettier.check()`
 * today — machine-generated or unparseable content, same reasoning that
 * excluded them from alex), plus `pnpm-lock.yaml` — prettier-specific
 * (alex never reads a lockfile, but prettier would try to reformat it):
 * machine-written by pnpm's own writer, and not gitignored (lockfiles are
 * tracked), so prettier picks it up by default. Reformatting it just
 * fights every subsequent `pnpm install` (this repo's own `.prettierignore`
 * already excludes it for that exact reason).
 */

import { ALEX_IGNORE_PATTERNS } from "../inclusive-language/config.js";

export const PRETTIER_IGNORE_PATTERNS: string[] = [...ALEX_IGNORE_PATTERNS, "pnpm-lock.yaml"];
