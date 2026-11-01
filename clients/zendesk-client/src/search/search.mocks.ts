import { mockGroup } from "../group/group.mocks.js";
import { mockTicket } from "../tickets/tickets.mocks.js";
import { mockUser } from "../user/user.mocks.js";
import type { ISearchResponse } from "./search.types.js";

/** Fixture for a search response whose results are groups. */
export const mockSearchResponseGroups: ISearchResponse = {
	count: 1,
	facets: null,
	results: [mockGroup],
};

/** Fixture for a search response whose results are tickets. */
export const mockSearchResponseTickets: ISearchResponse = {
	count: 1,
	facets: null,
	results: [mockTicket],
};

/** Fixture for a search response whose results are users. */
export const mockSearchResponseUsers: ISearchResponse = {
	count: 1,
	facets: null,
	results: [mockUser],
};
