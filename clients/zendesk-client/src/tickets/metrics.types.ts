interface ITimeInMinutes {
	business: number;
	calendar: number;
}

export interface ITicketMetric {
	agent_wait_time_in_minutes: ITimeInMinutes;
	assigned_at: string;
	assignee_stations: number;
	assignee_updated_at: string;
	created_at: string;
	custom_status_updated_at: string;
	first_resolution_time_in_minutes: ITimeInMinutes;
	full_resolution_time_in_minutes: ITimeInMinutes;
	group_stations: number;
	id: number;
	initially_assigned_at: string;
	latest_comment_added_at: string;
	on_hold_time_in_minutes: ITimeInMinutes;
	reopens: number;
	replies: number;
	reply_time_in_minutes: ITimeInMinutes;
	reply_time_in_seconds: {
		calendar: number;
	};
	requester_updated_at: string;
	requester_wait_time_in_minutes: ITimeInMinutes;
	solved_at: string;
	status_updated_at: string;
	ticket_id: number;
	updated_at: string;
}
