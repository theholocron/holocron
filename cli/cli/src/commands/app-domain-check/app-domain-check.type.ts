/** What {@link checkProjectDomain} found. */
export interface DomainCheck {
	/** `ok` when the project serves the domain, `skipped` when it could not be asked, `fail` when it does not. */
	status: "ok" | "skipped" | "fail";
	/** Why, for the report. */
	message: string;
}
