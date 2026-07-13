import type { IAttachment } from "../attachments/index.js";

export interface IUser {
	// False if the user has been deleted
	active?: boolean | null;
	// An alias displayed to end users
	alias?: string | null;
	// Whether or not the user is a chat-only agent
	chat_only?: boolean | null;
	// The time the user was created
	created_at?: string | null;
	// A custom role if the user is an agent on the Enterprise plan or above
	custom_role_id?: number | null;
	// The id of the user's default group
	default_group_id?: number | null;
	// Any details you want to store about the user, such as an address
	details?: string | null;
	// The user's primary email address. *Writeable on create only. On update, a secondary email is added. See Email Address
	email?: string | null;
	// A unique identifier from another system. The API treats the id as case insensitive. Example: "ian1" and "IAN1" are the same value.
	external_id?: string | null;
	// The time zone for the user
	iana_time_zone?: string | null;
	// Automatically assigned when the user is created
	id?: number | null;
	// Last time the user signed in to Zendesk Support or made an API request using an API token or basic authentication
	last_login_at?: string | null;
	// The user's locale. A BCP-47 compliant tag for the locale. If both "locale" and "locale_id" are present on create or update, "locale_id" is ignored and only "locale" is used.
	locale?: string | null;
	// The user's language identifier
	locale_id?: number | null;
	// Designates whether the user has forum moderation capabilities
	moderator?: boolean | null;
	// The user's name
	name: string | null;
	// Any notes you want to store about the user
	notes?: string | null;
	// True if the user can only create private comments
	only_private_comments?: boolean | null;
	// The id of the user's organization. If the user has more than one organization memberships, the id of the user's default organization. If updating, see Organization ID
	organization_id?: number | null;
	// The user's primary phone number. See Phone Number below
	phone?: string | null;
	// The user's profile picture represented as an Attachment object
	photo?: IAttachment | null;
	// A URL pointing to the user's profile picture.
	remote_photo_url?: string | null;
	// This parameter is inert and has no effect. It may be deprecated in the future. Previously, this parameter determined whether a user could access a CSV report in a legacy Guide dashboard. This dashboard has been removed. See Announcing Guide legacy reporting upgrade to Explore
	report_csv?: boolean | null;
	// If the agent has any restrictions; false for admins and unrestricted agents, true for other agents
	restricted_agent?: boolean | null;
	// The user's role.
	role?: "end-user" | "agent" | "admin" | null;
	// The user's role id. 0 for a custom agent, 1 for a light agent, 2 for a chat agent, 3 for a chat agent added to the Support account as a contributor (Chat Phase 4), 4 for an admin, and 5 for a billing admin
	role_type?: 0 | 1 | 2 | 3 | 4 | 5 | null;
	// If the user is shared from a different Zendesk Support instance. Ticket sharing accounts only
	shared?: boolean | null;
	// If the user is a shared agent from a different Zendesk Support instance. Ticket sharing accounts only
	shared_agent?: boolean | null;
	// Whether the phone number is shared or not. See Phone Number below
	shared_phone_number?: boolean | null;
	// The user's signature. Only agents and admins can have signatures
	signature?: string | null;
	// If the agent is suspended. Tickets from suspended users are also suspended, and these users cannot sign in to the end user portal
	suspended?: boolean | null;
	// The user's tags. Only present if your account has user tagging enabled
	tags?: string[] | null;
	// Specifies which tickets the user has access to.
	ticket_restriction?:
		| "organization"
		| "groups"
		| "assigned"
		| "requested"
		| null;
	// The user's time zone. See Time Zone
	time_zone?: string | null;
	// If two-factor authentication is enabled
	two_factor_auth_enabled?: boolean | null;
	// The time the user was last updated
	updated_at?: string | null;
	// The user's API url
	url?: string | null;
	// Values of custom fields in the user's profile. See User Fields
	user_fields?: Record<string, unknown> | null;
	// Any of the user's identities is verified. See User Identities
	verified?: boolean | null;
}
