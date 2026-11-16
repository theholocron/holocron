import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEnvLookup } from "@theholocron/env-utils/lookup";

import { downloadCli } from "./download-cli.js";
import { expandGlob } from "./expand-glob.js";
import { CodecovCli } from "./shell.js";
import type { UploadDeps } from "./upload.type.js";

/** What {@link defaultUploadDeps} can be told instead of the real thing, so a test reaches each default once. */
export interface DefaultUploadDepsOptions {
	/** The environment the OIDC variables are read from, and the Codecov CLI inherits. Defaults to the process's. */
	env?: Record<string, string | undefined>;
	/** `fetch`. */
	fetch?: typeof fetch;
	/** Spawns `gpg` and the Codecov CLI. */
	spawn?: typeof spawnSync;
	/** Where the scratch folders go. Defaults to the system's temporary folder. */
	tmp?: string;
	/** Where progress lines go. Defaults to stdout. */
	write?: (line: string) => void;
}

/**
 * The real dependencies of {@link uploadCoverage}: the Actions environment, the global `fetch`, the file system, a
 * `::add-mask::` command for the log, and a Codecov CLI downloaded, checked and made executable in a scratch folder on
 * first use.
 */
export function defaultUploadDeps(options: DefaultUploadDepsOptions = {}): UploadDeps {
	// The child process inherits the whole environment (its CI detection reads it), which the env lookup cannot hand over.
	// eslint-disable-next-line no-restricted-properties
	const environment = options.env ?? process.env;
	const lookup = createEnvLookup(options.env);
	const doFetch = options.fetch ?? fetch;
	const spawn = options.spawn ?? spawnSync;
	const tmp = options.tmp ?? tmpdir();
	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
	const log = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
	return {
		env: (name) => lookup.get(name),
		fetch: doFetch,
		prepareCli: async () => {
			const dir = mkdtempSync(join(tmp, "codecov-cli-"));
			const binary = await downloadCli({
				dir,
				sleep,
				deps: {
					fetch: doFetch,
					spawn,
					writeFile: (path, data) => writeFileSync(path, data),
					makeExecutable: (path) => chmodSync(path, 0o755),
					makeDir: (path, mode) =>
						mkdirSync(path, { recursive: true, ...(mode === undefined ? {} : { mode }) }),
				},
			});
			return new CodecovCli({ binary, spawn, env: environment });
		},
		expandGlob,
		readFile: (path) => readFileSync(path, "utf-8"),
		writeFile: (path, data) => writeFileSync(path, data),
		makeTempDir: () => mkdtempSync(join(tmp, "codecov-reports-")),
		sleep,
		log,
		mask: (value) => log(`::add-mask::${value}`),
	};
}
