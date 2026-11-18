import type { GitTag, NpmDistTags } from "@theholocron/astromech";
import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { RuntimeContext } from "../../plugin/index.js";

/** What `doctor releases` reads from git, npm and the workspace, so a test can supply it without any of them. */
export interface ReleasesIo {
	/** Every git tag of the repository, with when it was made when git says. */
	tags(): GitTag[];
	/** The public packages a line publishes: a version group's folder, or with no group everything outside `excludeGroups`. */
	packages(scope: { group?: string; excludeGroups?: readonly string[] }): string[];
	/** The dist-tags npm serves for a package, or `undefined` when npm has no such package. A failed request throws. */
	distTags(name: string): Promise<NpmDistTags>;
	/** The time now, in seconds since the epoch. */
	now(): number;
}

export interface RunDoctorReleasesInput {
	/** The loaded config: its `release` task names the version groups. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** Defaults to the real git, npm registry and workspace. */
	io?: ReleasesIo;
	/** A tag younger than this many seconds is not reported as stuck: its release may still be publishing. Default 1800. */
	graceSeconds?: number;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorReleasesReport {
	/** `fail` if any release line has a tag npm never received, `skip` if nothing could be checked, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is the case. */
	reason?: string;
}
