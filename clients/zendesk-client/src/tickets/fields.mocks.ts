import type { ICustomField, ITicketField, TTicketFieldResponse, TTicketFieldsResponse } from "./fields.types.js";

export const mockCustomField1: ICustomField = {
	id: 27642,
	value: "745"
};

export const mockCustomField2: ICustomField = {
	id: 27648,
	value: "yes"
};

export const mockCustomFields: ICustomField[] = [
	mockCustomField1,
	mockCustomField2,
];

export const mockTicketField: ITicketField = {
	active: true,
	agent_description: "Agent only description",
	collapsed_for_agents: false,
	created_at: "2009-07-20T22:55:29Z",
	description: "This is the subject field of a ticket",
	editable_in_portal: true,
	id: 34,
	position: 21,
	raw_description: "This is the subject field of a ticket",
	raw_title: "{{dc.my_title}}",
	raw_title_in_portal: "{{dc.my_title_in_portal}}",
	regexp_for_validation: null,
	required: true,
	required_in_portal: true,
	tag: null,
	title: "Subject",
	title_in_portal: "Subject",
	type: "subject",
	updated_at: "2011-05-05T10:38:52Z",
	url: "https://company.zendesk.com/api/v2/ticket_fields/34.json",
	visible_in_portal: true,
};

export const mockTicketFieldsResponse: TTicketFieldsResponse = {
	count: 1,
	ticket_fields: [ mockTicketField ],
};

export const mockTicketFieldResponse: TTicketFieldResponse = {
	count: 1,
	ticket_field: mockTicketField,
};
