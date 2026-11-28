/**
 * Preload for running the CLI from source (`pnpm --filter @theholocron/cli start:source`, which is `tsx --import` this
 * file): lets the source import the text files the build inlines (`.holocron/org.md`). Needs Node 22.15 or later
 * (`module.registerHooks`). The built `dist/cli.mjs` has the text inlined and does not use this.
 */

// `module.registerHooks` is experimental before Node 23.5; this file only runs from source, on Node 22.15+.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { registerHooks } from "node:module";

import { textImportLoad } from "./text-import-load/index.js";

registerHooks({ load: textImportLoad });
