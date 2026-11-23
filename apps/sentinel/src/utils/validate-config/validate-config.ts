/**
 * Reads a repo's `holocron.config.*` (plus an optional dedicated
 * `astromech.config.*`, merged on top via datapad's
 * `loadLayeredFromContent()` — the same manifest `holocron run` / `ci` / `sync`
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
 * The `.holocron/` directory beside the config (#1785) is listed and fetched at the same `ref` (within the caps of
 * `fetchConfigDir()`), written into the sandbox before the config is evaluated, and its area files are placed on the
 * loaded config with the CLI's `placeAreas()`. The directory is that of the repo's root config, so no area is
 * inherited from a parent directory here: `loadConfigDir()` gets no `shared` list (#1829). A repo without the directory is unchanged, and a new area needs no
 * change here. Role sync, property sync and the PR config check all read the config through this function, so they
 * see the merged result. A cap exceeded, or a `.holocron/` file that cannot be loaded or placed, is a `load-error`.
 *
 * D8 parity: the actual execution of `holocron.config.ts` reuses
 * `@theholocron/datapad`'s `loadConfigFromContent()` unchanged — the same
 * `loadFile` internals `holocron setup`/`sync` use locally via
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
import { coerceTasks, normalizeTaskEntry, type TasksConfig, type TasksInput } from "@theholocron/astromech/config";
import { HOLOCRON_AREAS, type HolocronConfig, placeAreas } from "@theholocron/cli";
import {
	ConfigFileError,
	loadConfigDir,
	loadConfigFromContent,
	loadLayeredFromContent,
	readConfigSource,
	withConfigSandbox,
	writeConfigDir,
} from "@theholocron/datapad";
import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { errorMessage } from "@theholocron/misc-utils";

import { decodeContents } from "../decode-contents/index.js";
import { fetchConfigDir } from "../fetch-config-dir/index.js";
import { getPackageRoot } from "../package-root/index.js";
import type { ValidateConfigInput, ValidateConfigResult } from "./validate-config.type.js";

/** Where a repo keeps the area files of its config: `.<config name>/`. */
const CONFIG_DIR = ".holocron";

/** How long a read at a branch (or the default branch) is reused: long enough for one burst of deliveries, short enough that a merged config is seen soon. */
export const CONFIG_BRANCH_TTL_MS = 60_000;

/** How long a read at a commit is reused. A commit never changes, so this only bounds the memory of a warm instance. */
export const CONFIG_COMMIT_TTL_MS = 10 * 60_000;

/** How many reads are kept; older entries are dropped first, so a long-lived instance stays small. */
export const CONFIG_CACHE_MAX_ENTRIES = 50;

const configCache = new Map<string, { at: number; promise: Promise<ValidateConfigResult> }>();

/** Forgets every cached read; for tests, and for anything that must see the repository as it is now. */
export function resetValidateConfigCache(): void {
	configCache.clear();
}

/**
 * Reads and validates a repo's config (see the module comment), sharing one read between the deliveries and actions
 * that ask for the same repo and ref at about the same time. Reading the `.holocron/` tree costs a GitHub call per
 * directory and file, and a single delivery asks several times (the feed, the board, the labels, the aggregate), so
 * without this a burst of deliveries exhausted the App's hourly quota (#2426). A read in progress is shared too, so
 * concurrent callers make one read. A GitHub failure is never kept. `fresh: true` reads again, for a caller that writes
 * persistent state from the result (the property sync on a push to the default branch).
 */
export async function validateConfig(input: ValidateConfigInput): Promise<ValidateConfigResult> {
	if (input.fresh === true) return loadRepoConfig(input);
	const now = input.now ?? Date.now();
	const key = `${input.repo}@${input.ref ?? "default"}`;
	const ttl =
		input.ref !== undefined && /^[0-9a-f]{40}$/.test(input.ref) ? CONFIG_COMMIT_TTL_MS : CONFIG_BRANCH_TTL_MS;
	const hit = configCache.get(key);
	if (hit !== undefined && now - hit.at < ttl) return hit.promise;

	for (const [stale, entry] of configCache) {
		if (now - entry.at >= CONFIG_COMMIT_TTL_MS || configCache.size >= CONFIG_CACHE_MAX_ENTRIES)
			configCache.delete(stale);
	}
	const entry = { at: now, promise: loadRepoConfig(input) };
	configCache.set(key, entry);
	try {
		return await entry.promise;
	} catch (err) {
		// Forget a failed read, unless a newer one has taken its place.
		if (configCache.get(key) === entry) configCache.delete(key);
		throw err;
	}
}

async function loadRepoConfig(input: ValidateConfigInput): Promise<ValidateConfigResult> {
	const { client, repo, ref } = input;

	const fetch = fetchRepoFile(client, repo, ref);
	const source = await readConfigSource({ name: "holocron", fetch });
	if (!source) return { status: "no-config" };

	const { path, extension: ext, content: raw } = source;

	const nodeModules = join(await getPackageRoot(), "node_modules");
	return withConfigSandbox({ nodeModules, prefix: "sentinel-validate-" }, async (tmpDir) => {
		let loaded: { config: TasksConfig };
		try {
			// The `.holocron/` tree goes into the sandbox before the config is evaluated, because the config may
			// import from it (`./.holocron/notifications.js`). Every file is written, but only what the config or
			// an area file imports is ever evaluated; the area files are then loaded by name and placed with the
			// CLI's own `placeAreas()`, so the merged config is what `holocron` itself would resolve (#1785).
			const tree = await fetchConfigDir({ client, repo, dir: CONFIG_DIR, ref });
			await writeConfigDir({ dir: tmpDir, files: tree });
			const base = await loadConfigFromContent<TasksConfig>({
				dir: tmpDir,
				content: raw,
				name: "holocron",
				extension: ext,
			});
			const areas = await loadConfigDir({ cwd: tmpDir, dir: CONFIG_DIR, areas: HOLOCRON_AREAS });
			loaded = { config: placeAreas(areas, base.config as HolocronConfig) };
		} catch (err) {
			// A GitHub failure is not the repo's config being wrong; it propagates as every other read does.
			if (err instanceof ProviderApiError) throw err;
			return {
				status: "load-error",
				filepath: path,
				message: errorMessage(err),
			};
		}
		// The dedicated astromech.config.* layer (holocron#916): merged on
		// top of holocron.config's own tasks by datapad's loadLayeredFromContent(),
		// the content counterpart of the loadLayered() that astromech's
		// loadTasksConfig() uses for `holocron run` / `ci` / `sync`, so a
		// task declared only there (this repo's platform.repoValidation)
		// is visible to every Sentinel gate, not just the CLI. The parent is
		// the config already loaded above, with its areas placed.
		let layered;
		try {
			layered = await loadLayeredFromContent<TasksConfig>({
				dir: tmpDir,
				name: "astromech",
				fetch,
				fallback: { key: "tasks", preloaded: { config: loaded.config, filepath: path } },
				coerce: (raw) => coerceTasks(raw as TasksInput | undefined),
			});
		} catch (err) {
			// Only a file that was found and could not be executed is the repo's config being wrong; a GitHub failure
			// reading it propagates, as every other read does. loadLayeredFromContent() names the file it failed on.
			if (!(err instanceof ConfigFileError)) throw err;
			return { status: "load-error", filepath: err.filepath as string, message: errorMessage(err) };
		}
		const config: TasksConfig = { ...loaded.config, ...layered?.config };

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
