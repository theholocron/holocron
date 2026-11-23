/** What a webhook delivery is, once known: the event type, the repository (or organization) and GitHub's delivery id. */
export interface GitHubDeliveryInfo {
	/** The event type Sentinel read, such as `pull_request.opened`. */
	event?: string;
	/** `owner/repo`, or the organization for an org-level event. */
	repo?: string;
	/** GitHub's `X-GitHub-Delivery` id, so a delivery can be found in the App's delivery log. */
	delivery?: string;
}

/** The calls one delivery has made to GitHub so far, with what it is. */
export interface GitHubDeliveryCalls extends GitHubDeliveryInfo {
	/** Every call to the GitHub API. */
	calls: number;
	/** The calls that read the `.holocron/` config tree and the config files (`/contents/`). */
	contents: number;
}
