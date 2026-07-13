import type { ITicketMetric } from "./metrics.types.js";

export const mockTicketMetric: ITicketMetric = {
	agent_wait_time_in_minutes: {
		business: 737,
		calendar: 2391,
	},
	assigned_at: "2011-05-05T10:38:52Z",
	assignee_stations: 1,
	assignee_updated_at: "2011-05-06T10:38:52Z",
	created_at: "2009-07-20T22:55:29Z",
	custom_status_updated_at: "2011-05-09T10:38:52Z",
	first_resolution_time_in_minutes: {
		business: 737,
		calendar: 2391,
	},
	full_resolution_time_in_minutes: {
		business: 737,
		calendar: 2391,
	},
	group_stations: 7,
	id: 33,
	initially_assigned_at: "2011-05-03T10:38:52Z",
	latest_comment_added_at: "2011-05-09T10:38:52Z",
	on_hold_time_in_minutes: {
		business: 637,
		calendar: 2290,
	},
	reopens: 55,
	replies: 322,
	reply_time_in_minutes: {
		business: 737,
		calendar: 2391,
	},
	reply_time_in_seconds: {
		calendar: 143460,
	},
	requester_updated_at: "2011-05-07T10:38:52Z",
	requester_wait_time_in_minutes: {
		business: 737,
		calendar: 2391,
	},
	solved_at: "2011-05-09T10:38:52Z",
	status_updated_at: "2011-05-04T10:38:52Z",
	ticket_id: 4343,
	updated_at: "2011-05-05T10:38:52Z",
};
