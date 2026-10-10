/**
 * Reads a repo's `holocron.config.*` (plus an optional dedicated
 * `astromech.config.*`, merged on top via astromech's own
 * `mergeTasksLayers()` — the same manifest `holocron run` / `ci` / `sync`
 * act on, holocron#916) and validates the merged `tasks` array
 * against `@theholocron/astromech`'s canonical task registry (D11 — one
 * table, imported rather than duplicated). Defaults to the repo's default
 * branch (`ref` omitted — GitHub's Contents API resolves that on its own);
 * a caller passes `ref` explicitly to validate a specific commit/branch
 * instead (holocron#820 — the auto-fix-commit opt-in flag needs to see
 * what a PR's *own* branch currently declares, not only what's merged).
 *
 * Security boundary (D4/D6, amended for #820): a `ref`-based read is safe
 * for *validation only* — this function never persists or writes
 * anything itself, so no derived state can leak in from an unreviewed PR
 * branch. What must never happen: feeding a `ref`-based result into
 * anything that writes persistent state (`syncPropertiesFromConfig()`'s
 * GitHub custom-properties write, the capability-compliance check) or
 * anything that gates on the *repo's* declared task list as opposed to
 * one PR's own proposal (Bucket 2 dispatch). Those stay on the ref-less,
 * default-branch call — same as before this amendment. Same-repo only
 * either way (D6): a fork's branch is never a valid `ref` here, no
 * different from every other Sentinel read.
 *
 * D8 parity: the actual execution of `holocron.config.ts` reuses
 * `@theholocron/datapad`'s `loadConfigFromContent()` unchanged — the same
 * `loadFile` internals `holocron repo setup`/`sync` use locally via
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
 *
 * That alone isn't enough, though: Node determines whether a `.ts`/`.js` file
 * is ESM or CommonJS from the nearest ancestor `package.json`'s `"type"`
 * field, defaulting to CommonJS when none exists — and `tmpDir` starts out
 * with none. Without an explicit `{"type":"module"}` written into `tmpDir`
 * itself, `tsx`'s loader (correctly honoring that CJS default) tries to
 * `require()` `@theholocron/cli`'s pure-ESM `dist/index.mjs`, which Node
 * rejects outright ("require() of ES Module ... not supported"). Found live
 * against a real theholocron/clients delivery once #753's logging made the
 * previously-invisible load-error message visible at all.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { KNOWN_TASKS, KNOWN_WORKFLOWS } from "@theholocron/astromech";
import { mergeTasksLayers, normalizeTaskEntry, type TasksConfig } from "@theholocron/astromech/config";
import { DEFAULT_EXTENSIONS, loadConfigFromContent } from "@theholocron/datapad";
import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { errorMessage } from "@theholocron/misc-utils";

import { decodeContents } from "./decode-contents.js";
import { getPackageRoot } from "./package-root.js";

export type ValidateConfigResult =
	| { status: "valid"; filepath: string; config: TasksConfig }
	| { status: "no-config" }
	| { status: "unknown-tasks"; filepath: string; unknownTasks: string[] }
	| { status: "load-error"; filepath: string; message: string };

export interface ValidateConfigInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** A specific commit/branch to validate instead of the default branch. See the module docstring for what a `ref`-based result may (and may not) be used for. */
	ref?: string;
}

export async function validateConfig(input: ValidateConfigInput): Promise<ValidateConfigResult> {
	const { client, repo, ref } = input;

	for (const ext of DEFAULT_EXTENSIONS) {
		const path = `holocron.config.${ext}`;
		let raw: string;
		try {
			const contents = await client.git.getContents(repo, path, ref);
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
		await symlink(join(await getPackageRoot(), "node_modules"), join(tmpDir, "node_modules"), "dir");
		// See the module docstring: without this, Node defaults tmpDir's
		// .ts/.js files to CommonJS, and tsx's loader correctly honors that --
		// require()-ing @theholocron/cli's pure-ESM dist/index.mjs fails outright.
		await writeFile(join(tmpDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
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
					message: errorMessage(err),
				};
			}
			// The dedicated astromech.config.* layer (holocron#916): merged on
			// top of holocron.config's own tasks exactly as astromech's
			// loadTasksConfig() does for `holocron run` / `ci` / `sync`, so a
			// task declared only there (this repo's platform.repoValidation)
			// is visible to every Sentinel gate, not just the CLI.
			const dedicated = await loadDedicatedTasks(client, repo, ref, tmpDir);
			if (dedicated.status === "load-error") return dedicated;
			const config: TasksConfig = {
				...loaded.config,
				...mergeTasksLayers(loaded.config.tasks, dedicated.config),
			};

			// A task-array entry is legitimate if it resolves to either a real
			// runnable task (KNOWN_TASKS, e.g. "verification.unitTests") or a
			// workflow-only community-health automation with no local runner at
			// all (KNOWN_WORKFLOWS, e.g. "stale"/"greetings"/"bookkeeping") --
			// thinCallers() itself accepts either shape when generating CI, so
			// validation here needs to match. Checking KNOWN_TASKS alone flagged
			// every repo using these bare workflow-only names as "unknown-tasks",
			// discovered live against theholocron/clients's real config.
			const unknownTasks = (config.tasks ?? [])
				.map(normalizeTaskEntry)
				.map((t) => t.name)
				.filter((name) => !KNOWN_TASKS.has(name) && !KNOWN_WORKFLOWS.has(name));

			if (unknownTasks.length > 0) {
				return { status: "unknown-tasks", filepath: path, unknownTasks };
			}
			return { status: "valid", filepath: path, config };
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	}

	return { status: "no-config" };
}

type DedicatedTasksResult =
	{ status: "found" | "absent"; config?: TasksConfig } | { status: "load-error"; filepath: string; message: string };

/**
 * Reads and executes the repo's optional `astromech.config.*` at `ref`, in
 * the same prepared `tmpDir` as `holocron.config.*` (its own
 * `@theholocron/astromech/config` import resolves through the same
 * `node_modules` symlink). Same TS-first extension probe; a 404 on every
 * extension means the repo has no dedicated layer.
 */
async function loadDedicatedTasks(
	client: Pick<GitHubClient, "git">,
	repo: string,
	ref: string | undefined,
	tmpDir: string
): Promise<DedicatedTasksResult> {
	for (const ext of DEFAULT_EXTENSIONS) {
		const path = `astromech.config.${ext}`;
		let raw: string;
		try {
			const contents = await client.git.getContents(repo, path, ref);
			raw = decodeContents(contents.content);
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404) continue;
			throw err;
		}

		try {
			const loaded = await loadConfigFromContent<TasksConfig>({
				dir: tmpDir,
				content: raw,
				name: "astromech",
				extension: ext,
			});
			return { status: "found", config: loaded.config };
		} catch (err) {
			return { status: "load-error", filepath: path, message: errorMessage(err) };
		}
	}
	return { status: "absent" };
}
