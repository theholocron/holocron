import type {
	ITicket,
	TTicketResponse,
	TTicketsResponse,
	IVia,
	IMetadata,
} from "./tickets.types.js";
import { mockCustomFields } from "./fields.mocks.js";

export const mockVia: IVia = {
	channel: "web",
	source: {
		from: {},
		rel: "web_widget",
		to: {},
	},
};

export const mockMetadata: IMetadata = {
	system: {
		client: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36",
		ip_address: "1.1.1.1",
		latitude: -37.000000000001,
		location: "Melbourne, 07, Australia",
		longitude: 144.0000000000002,
	},
	via: mockVia,
};

export const mockTicket: ITicket = {
	assignee_id: 235323,
	collaborator_ids: [35334, 234],
	created_at: "2009-07-20T22:55:29Z",
	custom_fields: mockCustomFields,
	custom_status_id: 123,
	description: "The fire is very colorful.",
	due_at: null,
	external_id: "ahg35h3jh",
	follower_ids: [35334, 234],
	from_messaging_channel: false,
	group_id: 98738,
	has_incidents: false,
	id: 35436,
	organization_id: 509974,
	priority: "high",
	problem_id: 9873764,
	raw_subject: "{{dc.printer_on_fire}}",
	recipient: "support@company.com",
	requester_id: 20978392,
	satisfaction_rating: {
		comment: "Great support!",
		id: 1234,
		score: "good",
	},
	sharing_agreement_ids: [84432],
	status: "open",
	subject: "Help, my printer is on fire!",
	submitter_id: 76872,
	tags: ["enterprise", "other_tag"],
	type: "incident",
	updated_at: "2011-05-05T10:38:52Z",
	url: "https://company.zendesk.com/api/v2/tickets/35436.json",
	via: mockVia,
};

export const mockTicketsResponse: TTicketsResponse = {
	count: 1,
	tickets: [mockTicket],
};

export const mockTicketResponse: TTicketResponse = {
	count: 1,
	ticket: mockTicket,
};
