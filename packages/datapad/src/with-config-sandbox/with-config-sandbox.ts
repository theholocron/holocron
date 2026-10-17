import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ConfigSandboxOptions } from "./with-config-sandbox.type.js";

/**
 * Runs `run` with a throwaway directory prepared for
 * {@link loadConfigFromContent}'s `dir`, and removes it afterwards (also when
 * `run` throws).
 *
 * The directory is made for a TS/JS config that imports packages:
 *
 * - `node_modules` is a symlink to `options.nodeModules`, so those imports
 *   resolve as if the config sat next to that directory.
 * - A `package.json` of `{"type":"module"}` is written into it. Node decides
 *   whether a `.ts`/`.js` file is ESM or CommonJS from the nearest ancestor
 *   `package.json`'s `type`, defaulting to CommonJS — and `tsx`'s loader,
 *   correctly honouring that, would then `require()` a pure-ESM dependency
 *   such as `@theholocron/cli`'s `dist/index.mjs`, which Node rejects outright
 *   ("require() of ES Module … not supported").
 *
 * The directory lives under the OS temp dir by default rather than inside any
 * package: read-only deployments (Vercel's Node.js Functions ship the bundle
 * read-only under `/var/task`) can't create a directory there.
 */
export async function withConfigSandbox<R>(
	options: ConfigSandboxOptions,
	run: (dir: string) => Promise<R>
): Promise<R> {
	const root = options.root ?? tmpdir();
	await mkdir(root, { recursive: true });
	const dir = await mkdtemp(join(root, options.prefix ?? "datapad-"));
	try {
		await symlink(options.nodeModules, join(dir, "node_modules"), "dir");
		await writeFile(join(dir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
		return await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
