/**
 * Thin wrapper around `spawnSync` for the Codecov CLI.
 *
 * The CLI-transport path of the plugin, like the 1Password plugin's `op` wrapper: a uniform result so the callers do not
 * repeat the exit-code and decoding code. The upload token goes to the CLI in `CODECOV_TOKEN`, never in argv (a child's
 * argv shows in `ps`), and is removed from anything the CLI prints before the caller sees it.
 */

import { spawnSync } from "node:child_process";

import type { SpawnFn } from "./upload.type.js";

/** What one run of the Codecov CLI did. */
export interface CodecovCliResult {
	/** Whether it exited 0. */
	ok: boolean;
	/** Its standard output, trimmed, with the token removed. */
	stdout: string;
	/** Its standard error, trimmed, with the token removed (or the spawn error's message). */
	stderr: string;
}

/** What {@link CodecovCli} takes. */
export interface CodecovCliOptions {
	/** Path of the Codecov CLI binary. */
	binary: string;
	/** Override the spawn function in tests. */
	spawn?: SpawnFn;
	/** The environment the CLI runs in (its CI detection reads it); the token is added to a copy. */
	env: Record<string, string | undefined>;
}

/** The flags every Codecov CLI command is given: fail loudly, and take the commit from GitHub. */
const COMMON = ["--fail-on-error", "--git-service", "github"];

/** Runs the Codecov CLI's `create-commit`, `create-report` and `do-upload`. */
export class CodecovCli {
	private readonly binary: string;
	private readonly spawnImpl: SpawnFn;
	private readonly env: Record<string, string | undefined>;

	constructor(opts: CodecovCliOptions) {
		this.binary = opts.binary;
		this.spawnImpl = opts.spawn ?? spawnSync;
		this.env = opts.env;
	}

	/** Tells Codecov about the commit. */
	createCommit(token: string): CodecovCliResult {
		return this.run(token, ["create-commit", ...COMMON]);
	}

	/** Opens the report the per-flag uploads attach to. */
	createReport(token: string): CodecovCliResult {
		return this.run(token, ["create-report", ...COMMON]);
	}

	/** Uploads `files` under `flag`, searching for nothing else. */
	doUpload(token: string, flag: string, files: string[]): CodecovCliResult {
		return this.run(token, [
			"do-upload",
			"--flag",
			flag,
			"--disable-search",
			...COMMON,
			...files.flatMap((file) => ["--file", file]),
		]);
	}

	private run(token: string, args: string[]): CodecovCliResult {
		const out = this.spawnImpl(this.binary, args, {
			encoding: "utf-8",
			stdio: ["inherit", "pipe", "pipe"],
			env: { ...this.env, CODECOV_TOKEN: token },
		});
		const clean = (text: string) => text.split(token).join("***").trim();
		if (out.error) return { ok: false, stdout: "", stderr: clean(out.error.message) };
		return { ok: out.status === 0, stdout: clean(out.stdout ?? ""), stderr: clean(out.stderr ?? "") };
	}
}
