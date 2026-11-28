/** The forum of the #prs feed and what it leaves out. */
export interface PrFeedChannel {
	/** The forum channel's name, as in the layout. */
	name: string;
	/** Repositories (`owner/name`) not followed. */
	excludeRepos: string[];
	/** Authors (logins) not followed. */
	excludeAuthors: string[];
}
