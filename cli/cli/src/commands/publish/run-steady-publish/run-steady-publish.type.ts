import type { EnvLookup } from "@theholocron/env-utils/lookup";
import type { Logger } from "@theholocron/observability/core";

import type { PublicPackageEntry } from "../public-package-entry.type.js";
import type { PublishExecResult, PublishPrint } from "../publish.type.js";

export interface RunSteadyPublishInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
	/**
	 * Only this version group's packages: a folder of the repo (`clients`,
	 * `observability`). Omitted, every public package in the workspace.
	 */
	group?: string;
	/**
	 * Everything except these version groups, which release on their own. Used by the
	 * repo-wide release so it does not take in a group released separately.
	 */
	excludeGroups?: readonly string[];
	/** Distribution tag for the publish. Defaults to `'latest'` (steady-state releases are stable by default; `--initial`'s bootstrap default is `'alpha'`). */
	tag?: string;
	/** Skip the actual publish; print what would happen. */
	dryRun?: boolean;
	otp?: string;
	print?: PublishPrint;
	logger?: Logger;
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	env?: NodeJS.ProcessEnv;
	/** Where the job summary path (`GITHUB_STEP_SUMMARY`) is read from. Defaults to the process environment. */
	envLookup?: EnvLookup;
	/** Waits between the tries of a sigstore 409 (`--skip-already-published` only); injected so tests do not sleep. */
	sleep?: (ms: number) => Promise<void>;
	/** Wait before each retry of a sigstore 409, in ms; its length is the number of retries. Defaults to 5 s then 15 s. */
	backoffMs?: readonly number[];
	/** Override the list of package names/versions. Auto-discovered when omitted. */
	packages?: readonly PublicPackageEntry[];
	/** Add `--provenance`. Defaults to `true` — every steady-state publish runs in CI under OIDC, where provenance is free and expected. */
	provenance?: boolean;
	/**
	 * Check `npm view <pkg>@<version>` before publishing each package and
	 * skip it if that exact version already exists, instead of one bulk
	 * `pnpm -r publish`. For repos that ship many independently-versioned
	 * packages where a release doesn't bump every one of them (this repo's
	 * own lockstep-bump model doesn't need it — every package always gets a
	 * new version together). Defaults to `false`.
	 */
	skipAlreadyPublished?: boolean;
}
