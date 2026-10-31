/** Options for `createJiraClient()`. */
export interface JiraClientOptions {
	/** The base URL of the Jira REST API. */
	host: string;
	/** The pre-encoded Basic credential (Base64 of `email:apiToken`). */
	token: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

/** An issue's fields, keyed by field id or name. */
export interface JiraIssueFields {
	[key: string]: unknown;
}

/** A Jira issue. */
export interface JiraIssue {
	/** The issue id. */
	id: string;
	/** The issue key, e.g. `PROJ-123`. */
	key: string;
	/** The issue's fields. */
	fields: JiraIssueFields;
}

/** A project version (release). */
export interface JiraVersion {
	/** The version id. */
	id: string;
	/** The version name. */
	name: string;
	/** The key of the project the version belongs to. */
	project: string;
	/** The start date. */
	startDate?: string;
	/** The release date. */
	releaseDate?: string;
	/** Whether the version has been released. */
	released?: boolean;
	[key: string]: unknown;
}

/** A Jira project. */
export interface JiraProject {
	/** The project id. */
	id: string;
	/** The project key. */
	key: string;
	/** The project name. */
	name: string;
	/** The issue types the project allows; present when requested with `expand=issueTypes`. */
	issueTypes?: JiraIssueType[];
}

/** An issue type. */
export interface JiraIssueType {
	/** The issue type id. */
	id: string;
	/** The issue type name. */
	name: string;
}

/** A workflow transition an issue can take. */
export interface JiraTransition {
	/** The transition id. */
	id: string;
	/** The transition name. */
	name: string;
	/** The status the issue ends up in. */
	to: {
		/** The target status id. */
		id: string;
		/** The target status name. */
		name: string;
	};
}

/** An issue resolution. */
export interface JiraResolution {
	/** The resolution id. */
	id: string;
	/** The resolution name. */
	name: string;
	/** The resolution's description. */
	description?: string;
}

/** A kind of link between issues. */
export interface JiraIssueLinkType {
	/** The link type id. */
	id: string;
	/** The link type name. */
	name: string;
	/** The phrase describing the link from the inward issue. */
	inward: string;
	/** The phrase describing the link from the outward issue. */
	outward: string;
}

/** The response of `issues.search()`. */
export interface JiraSearchResponse {
	/** The issues on this page. */
	issues: JiraIssue[];
	/** The total number of matches. */
	total: number;
	/** The page size used. */
	maxResults: number;
	/** The index of the first issue on this page. */
	startAt: number;
}

/** Input for `issues.search()`. */
export interface JiraSearchQuery {
	/** The JQL query. */
	jql?: string;
	/** The index of the first result to return. */
	startAt?: number;
	/** The page size. */
	maxResults?: number;
	/** The fields to return for each issue. */
	fields?: string[];
}
