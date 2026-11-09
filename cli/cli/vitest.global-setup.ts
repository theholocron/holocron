/**
 * Vitest global setup: make sure `dist/cli.mjs` exists and is newer than the source, so the tests that run the built CLI
 * (`src/cli/cli-binary.test.ts`) test what is checked out. The check and the build are `ensureBuilt` in `@theholocron/kyber/testing`.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureBuilt } from "@theholocron/kyber/testing";

const root = dirname(fileURLToPath(import.meta.url));

export default function setup(): void {
	ensureBuilt({ bin: join(root, "dist", "cli.mjs"), srcDir: join(root, "src"), cwd: root });
}
