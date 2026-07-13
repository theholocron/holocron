import type {
	ICustomStatus,
	ICustomStatusesResponse,
	ICustomStatusResponse,
	IDefaultStatus,
} from "./status.types.js";

export const mockDefaultStatus: IDefaultStatus = {
	active: true,
	agent_label: "open",
	description: "Customer needs a response quickly",
	end_user_description: "Your ticket is being responded to",
	end_user_label: "open",
	status_category: "open",
};
export const mockCustomStatus: ICustomStatus = {
	active: true,
	agent_label: "Responding quickly",
	created_at: "2021-07-20T22:55:29Z",
	default: false,
	description: "Customer needs a response quickly",
	end_user_description: "Your ticket is being responded to",
	end_user_label: "Urgent processing",
	id: 35436,
	raw_agent_label: "Responding quickly",
	raw_description: "Customer needs a response quickly",
	raw_end_user_description: "Your ticket is being responded to",
	raw_end_user_label: "Urgent processing",
	status_category: "open",
	updated_at: "2021-07-20T22:55:29Z",
};

export const mockCustomStatusesResponse: ICustomStatusesResponse = {
	count: 1,
	custom_statuses: [mockCustomStatus],
};

export const mockCustomStatusResponse: ICustomStatusResponse = {
	count: 1,
	custom_status: mockCustomStatus,
};
