/** What {@link buildWorkBody} writes about. */
export interface WorkBodyInput {
	/** The issue's key as the tracker spells it. */
	issue: string;
	/** The issue's title. */
	issueTitle: string;
	/** The address of the issue's page, when the provider gave one. */
	issueUrl?: string;
	/** The spec file, relative to the repo root, when the work has one. */
	spec?: string;
}
