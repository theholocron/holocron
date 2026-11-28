interface ITimeInMinutes {
	business: number;
	calendar: number;
}

/** Time and activity metrics Zendesk records for a ticket. */
export interface ITicketMetric {
	/** Minutes the agent waited on the ticket. */
	agent_wait_time_in_minutes: ITimeInMinutes;
	/** When the ticket was last assigned (ISO 8601). */
	assigned_at: string;
	/** The number of agents the ticket has been assigned to. */
	assignee_stations: number;
	/** When the assignee last updated the ticket (ISO 8601). */
	assignee_updated_at: string;
	/** When the metric record was created (ISO 8601). */
	created_at: string;
	/** When the custom ticket status last changed (ISO 8601). */
	custom_status_updated_at: string;
	/** Minutes until the ticket was first resolved. */
	first_resolution_time_in_minutes: ITimeInMinutes;
	/** Minutes until the ticket was fully resolved, counting all reopens. */
	full_resolution_time_in_minutes: ITimeInMinutes;
	/** The number of groups the ticket has been assigned to. */
	group_stations: number;
	/** The id of the metric record. */
	id: number;
	/** When the ticket was first assigned (ISO 8601). */
	initially_assigned_at: string;
	/** When the latest comment was added (ISO 8601). */
	latest_comment_added_at: string;
	/** Minutes the ticket spent on hold. */
	on_hold_time_in_minutes: ITimeInMinutes;
	/** The number of times the ticket was reopened. */
	reopens: number;
	/** The number of public replies added to the ticket. */
	replies: number;
	/** Minutes until the first reply. */
	reply_time_in_minutes: ITimeInMinutes;
	/** Time until the first reply, in seconds. */
	reply_time_in_seconds: {
		/** Elapsed calendar time in seconds. */
		calendar: number;
	};
	/** When the requester last updated the ticket (ISO 8601). */
	requester_updated_at: string;
	/** Minutes the requester waited on the ticket. */
	requester_wait_time_in_minutes: ITimeInMinutes;
	/** When the ticket was solved (ISO 8601). */
	solved_at: string;
	/** When the ticket's status last changed (ISO 8601). */
	status_updated_at: string;
	/** The id of the ticket the metrics belong to. */
	ticket_id: number;
	/** When the metric record was last updated (ISO 8601). */
	updated_at: string;
}
