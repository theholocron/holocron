/**
 * Vitest global setup: make sure `dist/cli.mjs` exists and is newer than the source, so the tests that run the built CLI
 * (`cli-binary.test.ts`) test what is checked out. The check and the build are `ensureBuilt` in `@theholocron/kyber/testing`.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureBuilt } from "@theholocron/kyber/testing";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI_BIN = join(root, "dist", "cli.mjs");

export default function setup(): void {
	ensureBuilt({ bin: CLI_BIN, srcDir: join(root, "src"), cwd: root });
}
