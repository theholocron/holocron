import type { IAPIResponse } from "../types.js";
import type { IUser } from "../user/user.types.js";

export interface IActivity {
	// The full user record of the user responsible for the ticket activity. See Users
	actor?: IUser | null;
	// The id of the user responsible for the ticket activity. An actor_id of "-1" is a Zendesk system user, such as an automations action.
	actor_id?: number | null;
	// When the record was created
	created_at?: string | null;
	// Automatically assigned on creation
	id?: number | null;
	// The content of the activity. Can be a ticket, comment, or change.
	object?: Record<string, unknown> | null;
	// The target of the activity, a ticket.
	target?: Record<string, unknown> | null;
	// Description of the activity
	title?: string | null;
	// When the record was last updated
	updated_at?: string | null;
	// The API url of the activity
	url?: string | null;
	// The full user record of the agent making the request. See Users
	user?: IUser | null;
	// The id of the agent making the request
	user_id?: number | null;
	// The type of activity
	verb?: "tickets.assignment" | "tickets.comment" | "tickets.priority_increase" | null;
}

export interface IActivityResponse extends IAPIResponse {
	activities: IActivity[];
	actors: IUser[];
	users: IUser[];
}
