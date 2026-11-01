/** Fields shared by paginated Zendesk API responses. */
export interface IAPIResponse {
	/** The URL of the next page, or null/absent if this is the last page. */
	next_page?: string | null;
	/** The URL of the previous page, or null/absent if this is the first page. */
	previous_page?: string | null;
	/** The total number of records. */
	count: number;
}

/** The error body returned by the Zendesk API. */
export interface IAPIError {
	/** A short error code or name. */
	error: string;
	/** A description of the error. */
	description: string;
}
