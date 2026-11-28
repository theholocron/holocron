/** One person, as the two trackers know them: a GitHub login and the email their Linear account has. */
export interface AssigneeLink {
	/** The GitHub login. */
	login: string;
	/** The email address of the person's Linear account. */
	email: string;
}

/** The assignees file: the pairs a sync uses to keep an assignee across trackers. */
export interface AssigneesFile {
	version: 1;
	links: AssigneeLink[];
}
