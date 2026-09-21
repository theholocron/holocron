/**
 * Reads a repo's `holocron.config.*` from its default branch and validates
 * its `tasks` array against `@theholocron/astromech`'s canonical task
 * registry (D11 — one table, imported rather than duplicated).
 *
 * Security boundary (D4/D6): `client.git.getContents()` takes no `ref`
 * parameter by design here — GitHub's Contents API defaults to the repo's
 * default branch when none is given, so this can structurally never read a
 * PR branch or fork, not just by policy.
 *
 * D8 parity: the actual execution of `holocron.config.ts` reuses
 * `@theholocron/datapad`'s `loadConfigFromContent()` unchanged — the same
 * `loadFile` internals `holocron setup`/`sync` use locally via
 * `loadConfigFile()`, not a bespoke server-side parser.
 *
 * The temp directory itself lives under the OS tmp dir (`os.tmpdir()`) —
 * Vercel's Node.js Functions ship the deployed bundle read-only (`/var/task`),
 * so a directory *inside this package* can never be created at runtime there
 * (`mkdir ENOENT`, found the hard way — crashed every `pull_request`/`push`
 * delivery). Real `holocron.config.ts` files commonly `import { defineConfig }
 * from "@theholocron/cli"` (the README's own documented pattern), and Node's
 * module resolution walks upward from the importing file looking for
 * `node_modules` — a bare file under `/tmp/...` would never find it. Fixed by
 * symlinking `<tmpDir>/node_modules` to this package's own real
 * `node_modules` (guaranteed present and *readable*, even though the
 * directory it lives in isn't writable) right after creating the temp dir —
 * the config file resolves `@theholocron/cli` through that symlink exactly as
 * if it were sitting inside `packages/sentinel/` itself.
 */

import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWN_TASKS, KNOWN_WORKFLOWS } from "@theholocron/astromech";
import { normalizeTaskEntry, type TasksConfig } from "@theholocron/astromech/config";
import { DEFAULT_EXTENSIONS, loadConfigFromContent } from "@theholocron/datapad";
import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "./decode-contents.js";
import { findPackageRoot } from "./package-root.js";

// Lazy + memoized, not a module-level constant: `findPackageRoot` does
// real filesystem work at import time otherwise, which means *any*
// webhook delivery — including event types that never call
// `validateConfig()` at all, like `installation` or `ping` — crashes the
// whole function if it fails. Found the hard way: a Vercel deploy where
// it couldn't resolve, taking down 100% of deliveries with
// `FUNCTION_INVOCATION_FAILED` before a single line of this module's own
// logic ever ran. Computing it lazily on first real use means a failure
// here only affects the config-validation path, not every event type.
let packageRootCache: string | undefined;
function getPackageRoot(): string {
	if (packageRootCache === undefined) {
		// tsdown bundles the whole package into one flat `dist/index.mjs`, so
		// "this module's own location" sits one level under package root when
		// built, but two levels under it here in source (`src/utils/`) —
		// walking up to the nearest `node_modules` resolves both without
		// hardcoding a depth that only one of the two would get right.
		packageRootCache = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
	}
	return packageRootCache;
}

export type ValidateConfigResult =
	| { status: "valid"; filepath: string; config: TasksConfig }
	| { status: "no-config" }
	| { status: "unknown-tasks"; filepath: string; unknownTasks: string[] }
	| { status: "load-error"; filepath: string; message: string };

export interface ValidateConfigInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
}

export async function validateConfig(input: ValidateConfigInput): Promise<ValidateConfigResult> {
	const { client, repo } = input;

	for (const ext of DEFAULT_EXTENSIONS) {
		const path = `holocron.config.${ext}`;
		let raw: string;
		try {
			const contents = await client.git.getContents(repo, path);
			raw = decodeContents(contents.content);
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404) continue;
			throw err;
		}

		const tmpRoot = tmpdir();
		await mkdir(tmpRoot, { recursive: true });
		const tmpDir = await mkdtemp(join(tmpRoot, "sentinel-validate-"));
		// Symlink, not a copy — this package's node_modules already exists and
		// is readable (just not writable, per the module docstring); a symlink
		// makes Node's upward module-resolution walk find it at <tmpDir>/node_modules
		// without duplicating anything.
		await symlink(join(getPackageRoot(), "node_modules"), join(tmpDir, "node_modules"), "dir");
		try {
			let loaded;
			try {
				loaded = await loadConfigFromContent<TasksConfig>({
					dir: tmpDir,
					content: raw,
					name: "holocron",
					extension: ext,
				});
			} catch (err) {
				return {
					status: "load-error",
					filepath: path,
					message: err instanceof Error ? err.message : String(err),
				};
			}
			// A task-array entry is legitimate if it resolves to either a real
			// runnable task (KNOWN_TASKS, e.g. "verification.unitTests") or a
			// workflow-only community-health automation with no local runner at
			// all (KNOWN_WORKFLOWS, e.g. "stale"/"greetings"/"bookkeeping") --
			// thinCallers() itself accepts either shape when generating CI, so
			// validation here needs to match. Checking KNOWN_TASKS alone flagged
			// every repo using these bare workflow-only names as "unknown-tasks",
			// discovered live against theholocron/clients's real config.
			const unknownTasks = (loaded.config.tasks ?? [])
				.map(normalizeTaskEntry)
				.map((t) => t.name)
				.filter((name) => !KNOWN_TASKS.has(name) && !KNOWN_WORKFLOWS.has(name));

			if (unknownTasks.length > 0) {
				return { status: "unknown-tasks", filepath: path, unknownTasks };
			}
			return { status: "valid", filepath: path, config: loaded.config };
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	}

	return { status: "no-config" };
}
