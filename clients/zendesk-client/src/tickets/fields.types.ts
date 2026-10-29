import type { IAPIResponse } from "../types.js";

export interface ICustomField {
	id: number | null;
	value: string | number | string[] | null;
}

export interface ITicketField {
	// Whether this field is available
	active?: boolean | null;
	// A description of the ticket field that only agents can see
	agent_description?: string | null;
	// If true, the field is shown to agents by default. If false, the field is hidden alongside infrequently used fields. Classic interface only
	collapsed_for_agents?: boolean | null;
	// The time the custom ticket field was created
	created_at?: string | null;
	// Required and presented for a custom ticket field of type "multiselect" or "tagger"
	custom_field_options?: Array<unknown> | null;
	// List of customized ticket statuses. Only presented for a system ticket field of type "custom_status"
	custom_statuses?: Array<unknown> | null;
	// Describes the purpose of the ticket field to users
	description?: string | null;
	// Whether this field is editable by end users in Help Center
	editable_in_portal?: boolean | null;
	// Automatically assigned when created
	id?: number | null;
	// The relative position of the ticket field on a ticket. Note that for accounts with ticket forms, positions are controlled by the different forms
	position?: number | null;
	// The dynamic content placeholder if present, or the description value if not. See Dynamic Content
	raw_description?: string | null;
	// The dynamic content placeholder if present, or the title value if not. See Dynamic Content
	raw_title?: string | null;
	// The dynamic content placeholder if present, or the "title_in_portal" value if not. See Dynamic Content
	raw_title_in_portal?: string | null;
	// For "regexp" fields only. The validation pattern for a field value to be deemed valid
	regexp_for_validation?: string | null;
	// A filter definition that allows your autocomplete to filter down results
	relationship_filter?: Record<string, unknown> | null;
	// A representation of what type of object the field references. Options are "zen:user", "zen:organization", "zen:ticket", or "zen:custom_object:CUSTOM_OBJECT_KEY". For example "zen:custom_object:apartment".
	relationship_target_type?: string | null;
	// If false, this field is a system field that must be present on all tickets
	removable?: boolean | null;
	// If true, agents must enter a value in the field to change the ticket status to solved
	required?: boolean | null;
	// If true, end users must enter a value in the field to create the request
	required_in_portal?: boolean | null;
	// For system ticket fields of type "priority" and "status". Defaults to 0. A "priority" sub type of 1 removes the "Low" and "Urgent" options. A "status" sub type of 1 adds the "On-Hold" option
	sub_type_id?: number | null;
	// Presented for a system ticket field of type "tickettype", "priority" or "status"
	system_field_options?: Array<unknown> | null;
	// For "checkbox" fields only. A tag added to tickets when the checkbox field is selected
	tag?: string | null;
	// The title of the ticket field
	title: string | null;
	// The title of the ticket field for end users in Help Center
	title_in_portal?: string | null;
	// System or custom field type. Editable for custom field types and only on creation. See Create Ticket Field
	type: string | null;
	// The time the custom ticket field was last updated
	updated_at?: string | null;
	// The URL for this resource
	url?: string | null;
	// Whether this field is visible to end users in Help Center
	visible_in_portal?: boolean | null;
}

export type TTicketFieldsResponse = IAPIResponse & {
	ticket_fields: ITicketField[];
};

export type TTicketFieldResponse = IAPIResponse & {
	ticket_field: ITicketField;
};
