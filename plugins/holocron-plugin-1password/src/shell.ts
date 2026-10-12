/**
 * Thin wrapper around `spawnSync` for `op` CLI shell-outs.
 *
 * Equivalent to the REST clients elsewhere in the monorepo, but for
 * the CLI-transport path. Provides:
 *
 *  - Uniform `OpResult` shape (`ok`, `stdout`, `stderr`) so capability
 *    methods don't repeat the exit-code + decoding boilerplate
 *  - Optional `--account <UUID>` injection on every call so a single
 *    OpShell instance is scoped to one 1P account even when the user
 *    has multiple accounts signed in (work + personal)
 *  - The critical stdio shape: `['inherit', 'pipe', 'pipe']`.
 *    Inheriting stdin gives `op` a TTY signal so it can fire the
 *    desktop biometric unlock dialog locally. CI runs see no TTY and
 *    use whichever auth mode the env vars configure (service account
 *    token). Default spawnSync stdio of `['pipe','pipe','pipe']` would
 *    suppress biometric unlock and return "not signed in" instead.
 */

import { spawnSync } from "node:child_process";

import { ProviderApiError } from "@theholocron/cli";

export interface OpResult {
	ok: boolean;
	stdout: string;
	stderr: string;
}

export interface OpShellOptions {
	/** Override the spawn function in tests. */
	spawn?: typeof spawnSync;
	/** Path to the op binary. Defaults to "op". */
	binary?: string;
	/** 1Password account UUID. When set, passed as `--account` on every call. */
	account?: string;
}

export interface RunOptions {
	/** Skip `--account` injection for commands that operate above the account level (e.g., `account list`). */
	skipAccount?: boolean;
}

export class OpShell {
	private readonly spawnImpl: typeof spawnSync;
	readonly binary: string;
	readonly account?: string;

	constructor(opts: OpShellOptions = {}) {
		this.spawnImpl = opts.spawn ?? spawnSync;
		this.binary = opts.binary ?? "op";
		if (opts.account !== undefined) this.account = opts.account;
	}

	/** Run `op <args>`, returning a uniform result. */
	run(args: string[], opts: RunOptions = {}): OpResult {
		const fullArgs = this.account && !opts.skipAccount ? ["--account", this.account, ...args] : args;
		const out = this.spawnImpl(this.binary, fullArgs, {
			encoding: "utf-8",
			stdio: ["inherit", "pipe", "pipe"],
		});
		if (out.error) {
			return { ok: false, stdout: "", stderr: out.error.message };
		}
		return {
			ok: out.status === 0,
			stdout: (out.stdout ?? "").trim(),
			stderr: (out.stderr ?? "").trim(),
		};
	}

	/** Run + throw if non-zero. Mirrors REST clients' `request<T>` ergonomic. */
	runOrThrow(args: string[], context: string, opts: RunOptions = {}): string {
		const result = this.run(args, opts);
		if (!result.ok) {
			throw new ProviderApiError(
				`1Password ${context} failed: ${result.stderr || "no stderr"}`,
				0,
				result.stderr
			);
		}
		return result.stdout;
	}
}
