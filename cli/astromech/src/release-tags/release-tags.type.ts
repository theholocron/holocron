/** One line a repo releases on: the repo-wide one (tags `v1.2.3`) or a group's (tags `configs-v1.2.3`). */
export interface ReleaseLine {
	/** A name for reports: the group's folder, or `repo` for the line of everything outside a group. */
	id: string;
	/** What comes before the version in the line's tags: `v`, `configs-v`. */
	tagPrefix: string;
	/** The npm names of the public packages the line publishes. */
	packages: readonly string[];
}

/** A git tag and, when known, when it was made. */
export interface GitTag {
	name: string;
	/** Seconds since the epoch. */
	createdAt?: number;
}

/** A package's dist-tags on npm (`{ latest: "1.0.0", alpha: "1.1.0-alpha.2" }`), or `undefined` when it is not on npm. */
export type NpmDistTags = Readonly<Record<string, string>> | undefined;

/** How a line's newest tag on one channel compares with npm. */
export type ReleaseTagState =
	/** Every package serves that version or a later one. */
	| "published"
	/** Some package serves an older version (or none), and the tag is older than the grace period. */
	| "wedged"
	/** Some package serves an older version, but the tag is so new its release may still be publishing. */
	| "pending";

/** A package that does not serve the line's newest tag. */
export interface PackageBehind {
	name: string;
	/** What npm serves on the channel's dist-tag, or `undefined` when the package or the dist-tag is not there. */
	onNpm: string | undefined;
}

/** The newest tag of one channel of one release line, against npm. */
export interface ReleaseTagCheck {
	line: string;
	/** The npm dist-tag the channel publishes to: `latest`, or the first prerelease identifier (`alpha`). */
	distTag: string;
	/** The git tag: `configs-v8.9.0-alpha.20`. */
	tag: string;
	/** The version in the tag. */
	version: string;
	state: ReleaseTagState;
	/** The packages that do not serve it; empty when `published`. */
	behind: readonly PackageBehind[];
}

export interface CheckReleaseLinesInput {
	lines: readonly ReleaseLine[];
	/** Every git tag of the repo. */
	tags: readonly GitTag[];
	/** The dist-tags of each package name in `lines`. A name missing from the map counts as not on npm. */
	npm: ReadonlyMap<string, NpmDistTags>;
	/** The time now, in seconds since the epoch. Only used with `graceSeconds`. */
	now?: number;
	/** A tag younger than this is `pending`, not `wedged`: its release job may still be publishing. Default 0. */
	graceSeconds?: number;
}
