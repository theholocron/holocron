export interface JiraClientOptions {
	host: string;
	token: string;
}

export interface JiraIssueFields {
	[key: string]: unknown;
}

export interface JiraIssue {
	id: string;
	key: string;
	fields: JiraIssueFields;
}

export interface JiraVersion {
	id: string;
	name: string;
	project: string;
	startDate?: string;
	releaseDate?: string;
	released?: boolean;
	[key: string]: unknown;
}

export interface JiraProject {
	id: string;
	key: string;
	name: string;
	issueTypes?: JiraIssueType[];
}

export interface JiraIssueType {
	id: string;
	name: string;
}

export interface JiraTransition {
	id: string;
	name: string;
	to: { id: string; name: string };
}

export interface JiraResolution {
	id: string;
	name: string;
	description?: string;
}

export interface JiraIssueLinkType {
	id: string;
	name: string;
	inward: string;
	outward: string;
}

export interface JiraSearchResponse {
	issues: JiraIssue[];
	total: number;
	maxResults: number;
	startAt: number;
}

export interface JiraSearchQuery {
	jql?: string;
	startAt?: number;
	maxResults?: number;
	fields?: string[];
}
