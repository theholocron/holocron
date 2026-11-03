/** A job of a thin caller as it was named before the names became the task id. */
export interface LegacyJob {
	/** The job id. */
	id: string;
	/** The job's `name:`, or none when the job had no `name:` (GitHub then shows the id). */
	name?: string;
}

/** What a thin caller was called before the names became the task id. */
export interface LegacyCaller {
	/** The workflow `name:`. */
	name: string;
	/** The workflow `name:` of the combined production-and-preview deploy caller, when it differed from `name`. */
	combinedName?: string;
	/** The caller's jobs, by the job id they have now. */
	jobs: Record<string, LegacyJob>;
	/** Literal text a generated caller carries beyond its template (the grouped release's matrix name), and its old spelling. */
	replace?: Record<string, string>;
}
