import type { IGroup } from "../group/group.types.js";
import type { ITicket } from "../tickets/tickets.types.js";
import type { IAPIResponse } from "../types.js";
import type { IUser } from "../user/user.types.js";

/** A page of search results from the Zendesk search API. */
export interface ISearchResponse extends IAPIResponse {
	/** Facet data for the results, if any. */
	facets?: string | null;
	/** The matching records: tickets, users or groups, depending on the query. */
	results: ITicket[] | IUser[] | IGroup[];
}
