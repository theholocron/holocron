import type { Logger } from "@theholocron/observability/core";

import type { PublicPackageEntry } from "../public-package-entry.type.js";
import type { PublishExecResult, PublishPrint } from "../publish.type.js";

export interface RunPublishInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
	/**
	 * Only this version group's packages: a folder of the repo (`clients`,
	 * `observability`). Omitted, every public package in the workspace.
	 */
	group?: string;
	/** Distribution tag for the publish. Defaults to `'alpha'`. */
	tag?: string;
	/** Skip the actual publish; print what would happen. */
	dryRun?: boolean;
	/**
	 * One-time password (TOTP) from your authenticator app. Required if
	 * your npm account has "Require 2FA for read and write" enabled.
	 * Reused across all sequential publishes — they fire within a few
	 * seconds, comfortably inside the TOTP window.
	 */
	otp?: string;
	print?: PublishPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/**
	 * Injectable command runner. Defaults to `spawnSync` with
	 * `stdio: ['inherit', 'pipe', 'pipe']` so interactive prompts
	 * (e.g., npm OTP) still work.
	 *
	 * Returns exit code + captured stdout/stderr.
	 */
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	/**
	 * Injectable `npm login --auth-type=web` runner, invoked when `npm
	 * whoami` shows no authenticated session. Fully `stdio: 'inherit'` (not
	 * `exec`'s captured-output shape) — the browser flow prints a URL and
	 * waits, and the operator needs to see that live. Defaults to a real
	 * `spawnSync`.
	 */
	login?: (cwd: string) => Promise<{ exitCode: number }>;
	/** Env vars; passed in for testability. Defaults to process.env. */
	env?: NodeJS.ProcessEnv;
	/**
	 * Override the packages checked against npm and shown in the
	 * Trusted Publisher next-steps output — `dir` is needed for the
	 * `pnpm --filter` target and the printed path column, `version` for the
	 * "will publish v<x>" row. Auto-discovered from packages/*\/package.json
	 * and plugins/*\/package.json (or the root package.json for a
	 * single-package repo) when omitted.
	 */
	packages?: readonly PublicPackageEntry[];
	/**
	 * Override the repo name shown in the Trusted Publisher next-steps
	 * output. Auto-detected from `git remote get-url origin` when omitted.
	 */
	repoName?: string;
	/**
	 * Override the org name shown in the Trusted Publisher next-steps
	 * output. Auto-detected from `git remote get-url origin` when omitted —
	 * same remote read as `repoName`, so providing one without the other
	 * still triggers that lookup for whichever one is missing.
	 */
	orgName?: string;
}
