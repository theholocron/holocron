import { mockGroup } from "../group/group.mocks.js";
import { mockTicket } from "../tickets/tickets.mocks.js";
import { mockUser } from "../user/user.mocks.js";
import type { ISearchResponse } from "./search.types.js";

export const mockSearchResponseGroups: ISearchResponse = {
	count: 1,
	facets: null,
	results: [mockGroup],
};

export const mockSearchResponseTickets: ISearchResponse = {
	count: 1,
	facets: null,
	results: [mockTicket],
};

export const mockSearchResponseUsers: ISearchResponse = {
	count: 1,
	facets: null,
	results: [mockUser],
};
