import type { IAPIResponse } from "../types.js";

interface IStatus {
	// If true, the custom status is set to active, If false, the custom status is set to inactive
	active?: boolean | null;
	// The label displayed to agents. Maximum length is 48 characters
	agent_label?: string | null;
	// The description of when the user should select this custom ticket status
	description?: string | null;
	// The description displayed to end users
	end_user_description?: string | null;
	// The status category the custom ticket status belongs to.
	status_category?: string | null;
}

export interface IDefaultStatus extends IStatus {
	end_user_label?: "new" | "open" | "pending" | "hold" | "solved" | null;
}

export interface ICustomStatus extends IStatus {
	// The date and time the custom ticket status was created
	created_at?: string | null;
	// If true, the custom status is set to default. If false, the custom status is set to non-default
	default?: boolean | null;
	// The label displayed to end users. Maximum length is 48 characters
	end_user_label?: string | null;
	// Automatically assigned when the custom ticket status is created
	id?: number | null;
	// The dynamic content placeholder. If the dynamic content placeholder is not available, this is the "agent_label" value. See Dynamic Content Items
	raw_agent_label?: string | null;
	// The dynamic content placeholder. If the dynamic content placeholder is not available, this is the "description" value. Dynamic Content Items
	raw_description?: string | null;
	// The dynamic content placeholder. If the dynamic content placeholder is not available, this is the "end_user_description" value. See Dynamic Content Items
	raw_end_user_description?: string | null;
	// The dynamic content placeholder. If the dynamic content placeholder is not available, this is the "end_user_label" value. See Dynamic Content Items
	raw_end_user_label?: string | null;
	// The date and time the custom ticket status was last updated
	updated_at?: string | null;
	url?: string | null;
}

export interface ICustomStatusesResponse extends IAPIResponse {
	custom_statuses: ICustomStatus[];
}

export interface ICustomStatusResponse extends IAPIResponse {
	custom_status: ICustomStatus;
}
