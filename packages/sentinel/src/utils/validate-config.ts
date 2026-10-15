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
 * The config is executed in a throwaway directory prepared by datapad's
 * `withConfigSandbox()` — under the OS tmp dir (Vercel ships the bundle
 * read-only), with this package's own `node_modules` symlinked in so
 * `import { defineConfig } from "@theholocron/cli"` resolves, and an ESM
 * `package.json` so `tsx` doesn't default the files to CommonJS. See that
 * function for why each piece is needed.
 */

import { join } from "node:path";

import { KNOWN_TASKS, KNOWN_WORKFLOWS } from "@theholocron/astromech";
import { mergeTasksLayers, normalizeTaskEntry, type TasksConfig } from "@theholocron/astromech/config";
import { loadConfigFromContent, readConfigSource, withConfigSandbox } from "@theholocron/datapad";
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

	const fetch = fetchRepoFile(client, repo, ref);
	const source = await readConfigSource({ name: "holocron", fetch });
	if (!source) return { status: "no-config" };

	const { path, extension: ext, content: raw } = source;

	const nodeModules = join(await getPackageRoot(), "node_modules");
	return withConfigSandbox({ nodeModules, prefix: "sentinel-validate-" }, async (tmpDir) => {
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
		const dedicated = await loadDedicatedTasks(fetch, tmpDir);
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
	});
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
	fetch: (path: string) => Promise<string | undefined>,
	tmpDir: string
): Promise<DedicatedTasksResult> {
	const source = await readConfigSource({ name: "astromech", fetch });
	if (!source) return { status: "absent" };

	try {
		const loaded = await loadConfigFromContent<TasksConfig>({
			dir: tmpDir,
			content: source.content,
			name: "astromech",
			extension: source.extension,
		});
		return { status: "found", config: loaded.config };
	} catch (err) {
		return { status: "load-error", filepath: source.path, message: errorMessage(err) };
	}
}

/**
 * Fetches one file from the repo at `ref` through the Contents API, for
 * datapad's `readConfigSource`: its decoded content, or `undefined` on a 404
 * (the file isn't there). Any other failure propagates.
 */
function fetchRepoFile(client: Pick<GitHubClient, "git">, repo: string, ref: string | undefined) {
	return async (path: string): Promise<string | undefined> => {
		try {
			const contents = await client.git.getContents(repo, path, ref);
			return decodeContents(contents.content);
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404) return undefined;
			throw err;
		}
	};
}
