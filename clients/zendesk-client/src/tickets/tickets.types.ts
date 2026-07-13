import type { IAPIResponse } from "../types.js";
import type { IComment } from "./comments.types.js";
import type { ICustomField } from "./fields.types.js";

export type TTicketStatus =
	| "new"
	| "open"
	| "pending"
	| "hold"
	| "solved"
	| "closed";
export type TTicketPriority = "urgent" | "high" | "normal" | "low";
export type TTicketType = "problem" | "incident" | "question" | "task";

export interface IVia {
	channel: string | number | null;
	source?: {
		from?: Record<string, unknown>;
		rel?: string | null;
		to?: Record<string, unknown>;
	};
}

export interface IMetadata {
	system?: {
		client?: string | null;
		ip_address?: string | null;
		latitude?: number | null;
		location?: string | null;
		longitude?: number | null;
	};
	via: IVia;
}

export interface ITicket {
	// Permission for agents to add add attachments to a comment. Defaults to true
	allow_attachments?: boolean | null;
	// Is false if channelback is disabled, true otherwise. Only applicable for channels framework ticket
	allow_channelback?: boolean | null;
	// Write only. The email address of the agent to assign the ticket to
	assignee_email?: string | null;
	// The agent currently assigned to the ticket
	assignee_id?: number | null;
	// Write only. An array of the IDs of attribute values to be associated with the ticket
	attribute_value_ids?: string[] | null;
	// Enterprise only. The id of the brand this ticket is associated with
	brand_id?: number | null;
	// The ids of users currently CC'ed on the ticket
	collaborator_ids?: number[] | null;
	// POST requests only. Users to add as cc's when creating a ticket. See Setting Collaborators
	collaborators?: Array<unknown> | null;
	// Write only. An object that adds a comment to the ticket. See Ticket comments. To include an attachment with the comment, see Attaching files
	comment?: IComment | null;
	// When this record was created
	created_at?: string | null;
	// Custom fields for the ticket. See Setting custom field values
	custom_fields?: ICustomField[] | null;
	// The custom ticket status id of the ticket. See custom ticket statuses
	custom_status_id?: number | null;
	// Read-only first comment on the ticket. When creating a ticket, use comment to set the description. See Description and first comment
	description?: string | null;
	// If this is a ticket of type "task" it has a due date. Due date format uses ISO 8601 format.
	due_at?: string | null;
	// The ids of agents or end users currently CC'ed on the ticket. See CCs and followers resources in the Support Help Center
	email_cc_ids?: number[] | null;
	// Write only. An array of objects that represent agent or end users email CCs to add or delete from the ticket. See Setting email CCs
	email_ccs?: Array<Record<string, unknown>>;
	// An id you can use to link Zendesk Support tickets to local records
	external_id?: string | null;
	// The ids of agents currently following the ticket. See CCs and followers resources
	follower_ids?: number[] | null;
	// Write only. An array of objects that represent agent followers to add or delete from the ticket. See Setting followers
	followers?: Array<Record<string, unknown>>;
	// The ids of the followups created from this ticket. Ids are only visible once the ticket is closed
	followup_ids?: number[] | null;
	// The topic in the Zendesk Web portal this ticket originated from, if any. The Web portal is deprecated
	forum_topic_id?: number | null;
	// If true, the ticket's via type is a messaging channel.
	from_messaging_channel?: boolean | null;
	// The group this ticket is assigned to
	group_id?: number | null;
	// Is true if a ticket is a problem type and has one or more incidents linked to it. Otherwise, the value is false.
	has_incidents?: boolean | null;
	// Automatically assigned when the ticket is created
	id?: number | null;
	// Is true if any comments are public, false otherwise
	is_public?: boolean | null;
	// Write only. A macro ID to be recorded in the ticket audit
	macro_id?: number | null;
	// POST requests only. List of macro IDs to be recorded in the ticket audit
	macro_ids?: number[] | null;
	// Write only. Metadata for the audit. In the audit object, the data is specified in the custom property of the metadata object. See Setting Metadata
	metadata?: IMetadata | null;
	// The organization of the requester. You can only specify the ID of an organization associated with the requester. See Organization Memberships
	organization_id?: number | null;
	// The urgency with which the ticket should be addressed.
	priority?: TTicketPriority | null;
	// For tickets of type "incident", the ID of the problem the incident is linked to
	problem_id?: number | null;
	// The dynamic content placeholder, if present, or the "subject" value, if not. See Dynamic Content Items
	raw_subject?: string | null;
	// The original recipient e-mail address of the ticket. Notification emails for the ticket are sent from this address
	recipient?: string | null;
	// Write only. See Creating a ticket with a new requester
	requester?: Record<string, unknown>;
	// The user who requested this ticket
	requester_id: number | null;
	// Write only. Optional boolean. When true and an update_stamp date is included, protects against ticket update collisions and returns a message to let you know if one occurs. See Protecting against ticket update collisions. A value of false has the same effect as true. Omit the property to force the updates to not be safe
	safe_update?: boolean | null;
	// The satisfaction rating of the ticket, if it exists, or the state of satisfaction, "offered" or "unoffered". The value is null for plan types that don't support CSAT
	satisfaction_rating?: Record<string, unknown>;
	// The ids of the sharing agreements used for this ticket
	sharing_agreement_ids?: number[] | null;
	// The state of the ticket. If your account has activated custom ticket statuses, this is the ticket's status category. See custom ticket statuses.
	status?: TTicketStatus | null;
	// The value of the subject field for this ticket
	subject?: string | null;
	// The user who submitted the ticket. The submitter always becomes the author of the first comment on the ticket
	submitter_id?: number | null;
	// The array of tags applied to this ticket
	tags?: string[] | null;
	// Enterprise only. The id of the ticket form to render for the ticket
	ticket_form_id?: number | null;
	// The type of this ticket.
	type?: TTicketType | null;
	// When this record last got updated
	updated_at?: string | null;
	// Write only. Datetime of last update received from API. See the safe_update property
	updated_stamp?: string | null;
	// The API url of this ticket
	url?: string | null;
	// For more information, see the Via object reference
	via?: IVia | null;
	// POST requests only. The id of a closed ticket when creating a follow-up ticket. See Creating a follow-up ticket
	via_followup_source_id?: number | null;
	// Write only. For more information, see the Via object reference
	via_id?: number | null;
	// Write only. See Creating voicemail ticket
	voice_comment?: Record<string, unknown>;
}

export type TTicketsResponse = IAPIResponse & {
	tickets: ITicket[];
	deleted_ticket_forms?: Array<unknown>;
};

export type TTicketResponse = IAPIResponse & {
	ticket: ITicket;
	deleted_ticket_forms?: Array<unknown>;
};
