/** One issue (or pull request) as the backfill reads it. */
export interface BackfillItem {
	number: number;
	title: string;
	state: "open" | "closed";
	/** The names of its labels, as GitHub spells them. */
	labels: string[];
	/** Its Type (Bug, Feature, Task), or `null` when it has none. */
	type: string | null;
	/** Its milestone, or `null` when it has none. */
	milestone: { number: number; title: string } | null;
	/** Its GraphQL node id, which Projects need. */
	nodeId: string;
	/** GitHub's issues API lists pull requests too. */
	isPullRequest: boolean;
	/** When it was made, as an ISO 8601 timestamp. */
	createdAt: string;
}

/** An issue's parent, as far as the backfill needs it. */
export interface BackfillParent {
	number: number;
	/** The parent's milestone number, or `null` when it has none. */
	milestone: number | null;
}

/** What the backfill reads from, and writes to, the provider. Each is one request or a small fixed number of them. */
export interface BackfillApi {
	/** One page (100) of issues and pull requests of every state, oldest first; an empty page is the end. */
	list(page: number): Promise<BackfillItem[]>;
	/** One issue or pull request by number. */
	get(number: number): Promise<BackfillItem>;
	/** An issue's parent, or `null` when it has none. */
	parent(number: number): Promise<BackfillParent | null>;
	/** The names (lower case) of the labels the repository has. */
	labelNames(): Promise<Set<string>>;
	/** The number of the milestone with this title (any state), or `undefined`. */
	milestoneNumber(title: string): Promise<number | undefined>;
	/** The id of the organization's project with exactly this title, or `undefined`. */
	projectId(title: string): Promise<string | undefined>;
	/** For each node id, the ids of the projects it is on. */
	projectsOf(nodeIds: string[]): Promise<Map<string, string[]>>;
	/** The names (lower case) of the organization's issue fields, or the reason they could not be read. */
	fieldNames(): Promise<Set<string> | string>;
	/** The names (lower case) of the issue fields the issue has a value for. */
	fieldValues(number: number): Promise<Set<string>>;
	/** The paths a pull request changes. */
	files(number: number): Promise<string[]>;
	setType(number: number, type: string): Promise<void>;
	addLabels(number: number, labels: string[]): Promise<void>;
	setMilestone(number: number, milestone: number): Promise<void>;
	addToProject(projectId: string, nodeId: string): Promise<void>;
}

/** What `holocron probe github issue-types` was asked, read from its arguments. */
export interface BackfillOptions {
	/** `--issues`: only these numbers. */
	issues?: number[];
	/** `--since`: only issues made on or after this day (`YYYY-MM-DD`). */
	since?: string;
	/** `--after`: resume after this number (the cursor the last run printed). */
	after: number;
	/** `--limit`: the most issues one run reads. */
	limit: number;
	/** `--milestone`: the milestone for an issue in the window that has none. */
	milestone?: string;
	/** `--project`: the project for an issue in the window that is on none. */
	project?: string;
	/** `--pull-requests`: also give pull requests their area labels. */
	pullRequests: boolean;
}

/** The area declaration the plugin is handed from `repo.labels`. */
export interface AreaConfig {
	areas?: Record<string, string[]>;
	scopes?: Record<string, string>;
}

/** What `parseArgs` returns: the options, or the one thing wrong with the arguments. */
export type ParsedArgs = { ok: true; options: BackfillOptions } | { ok: false; message: string };
