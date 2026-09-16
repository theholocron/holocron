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
 * The temp directory is created *inside this package* (`packages/sentinel/
 * .tmp/`), not the OS tmp dir — real `holocron.config.ts` files commonly
 * `import { defineConfig } from "@theholocron/cli"` (the README's own
 * documented pattern), and Node's module resolution walks upward from the
 * importing file looking for `node_modules`. A file under `/tmp/...` would
 * never find it; a file under this package's own tree resolves through
 * `packages/sentinel/node_modules` — where `@theholocron/cli` is a real
 * dependency (below) precisely so this resolves.
 */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWN_TASKS } from "@theholocron/astromech";
import { normalizeTaskEntry, type TasksConfig } from "@theholocron/astromech/config";
import { DEFAULT_EXTENSIONS, loadConfigFromContent } from "@theholocron/datapad";
import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "./decode-contents.js";

// One level up from wherever this module actually runs from (`dist/` built,
// `src/` under vitest) is always the package root.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoot = join(packageRoot, ".tmp");

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

		await mkdir(tmpRoot, { recursive: true });
		const tmpDir = await mkdtemp(join(tmpRoot, "validate-"));
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
			const unknownTasks = (loaded.config.tasks ?? [])
				.map(normalizeTaskEntry)
				.map((t) => t.name)
				.filter((name) => !KNOWN_TASKS.has(name));

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
