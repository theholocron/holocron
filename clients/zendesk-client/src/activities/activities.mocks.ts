import { mockUser } from "../user/user.mocks.js";
import type { IActivity, IActivityResponse } from "./activities.types.js";

export const mockActivity: IActivity = {
	actor: mockUser,
	actor_id: 158488612,
	created_at: "2020-11-17T00:34:40Z",
	id: 29183462,
	object: {
		ticket: {
			id: 1521,
			subject: "test",
		},
	},
	target: {
		ticket: {
			id: 1521,
			subject: "test",
		},
	},
	title: "Tedd assigned ticket #1521 to you.",
	updated_at: "2020-11-17T00:34:40Z",
	url: "https://example.zendesk.com/api/v2/activities/29183462.json",
	user: mockUser,
	user_id: 3343,
	verb: "tickets.assignment",
};

export const mockActivityResponse: IActivityResponse = {
	activities: [mockActivity],
	actors: [mockUser],
	count: 1,
	next_page: null,
	previous_page: null,
	users: [mockUser],
};
