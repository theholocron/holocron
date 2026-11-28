import type { RestClient } from "../utils.js";

/** An email address attached to a Clerk user. */
export interface ClerkEmailAddress {
	/** The email address record's identifier. */
	id: string;
	/** The object type, always `"email_address"`. */
	object: "email_address";
	/** The email address itself. */
	email_address: string;
	/** The verification state (status and strategy), or `null` when none is recorded. */
	verification: { status: string; strategy: string } | null;
	/** The identities this address is linked to, each with an id and type. */
	linked_to: Array<{ id: string; type: string }>;
	/** When the address was created, as a Unix timestamp in milliseconds. */
	created_at: number;
	/** When the address was last updated, as a Unix timestamp in milliseconds. */
	updated_at: number;
}

/** A phone number attached to a Clerk user. */
export interface ClerkPhoneNumber {
	/** The phone number record's identifier. */
	id: string;
	/** The object type, always `"phone_number"`. */
	object: "phone_number";
	/** The phone number itself. */
	phone_number: string;
	/** Whether the number is reserved for second-factor authentication. */
	reserved_for_second_factor: boolean;
	/** Whether the number is the default second factor. */
	default_second_factor: boolean;
	/** The verification state of the number, or `null` when none is recorded. */
	verification: { status: string; strategy: string } | null;
	/** The identities this number is linked to, each with an id and type. */
	linked_to: Array<{ id: string; type: string }>;
	/** When the number was created, as a Unix timestamp in milliseconds. */
	created_at: number;
	/** When the number was last updated, as a Unix timestamp in milliseconds. */
	updated_at: number;
}

/** A user as the Clerk Backend API returns it. */
export interface ClerkUser {
	/** The user's identifier. */
	id: string;
	/** The object type, always `"user"`. */
	object: "user";
	/** The identifier the user has in your own system, or `null` when unset. */
	external_id: string | null;
	/** The id of the user's primary email address, or `null` when there is none. */
	primary_email_address_id: string | null;
	/** The id of the user's primary phone number, or `null` when there is none. */
	primary_phone_number_id: string | null;
	/** The id of the user's primary web3 wallet, or `null` when there is none. */
	primary_web3_wallet_id: string | null;
	/** The user's username, or `null` when unset. */
	username: string | null;
	/** The user's first name, or `null` when unset. */
	first_name: string | null;
	/** The user's last name, or `null` when unset. */
	last_name: string | null;
	/** The URL of the user's profile image. */
	profile_image_url: string;
	/** The URL of the user's image. */
	image_url: string;
	/** Whether the user has uploaded an image. */
	has_image: boolean;
	/** Metadata readable from the frontend and backend, writable only from the backend. */
	public_metadata: Record<string, unknown>;
	/** Metadata readable and writable only from the backend. */
	private_metadata: Record<string, unknown>;
	/** Metadata that the frontend can also read and write. */
	unsafe_metadata: Record<string, unknown>;
	/** The user's email addresses. */
	email_addresses: ClerkEmailAddress[];
	/** The user's phone numbers. */
	phone_numbers: ClerkPhoneNumber[];
	/** When the user last signed in, as a Unix timestamp in milliseconds, or `null` if they never have. */
	last_sign_in_at: number | null;
	/** Whether the user is banned. */
	banned: boolean;
	/** Whether the user is locked out. */
	locked: boolean;
	/** Seconds until the lockout ends, or `null` when the user is not locked. */
	lockout_expires_in_seconds: number | null;
	/** How many verification attempts the user has left, or `null` when not limited. */
	verification_attempts_remaining: number | null;
	/** When the user was created, as a Unix timestamp in milliseconds. */
	created_at: number;
	/** When the user was last updated, as a Unix timestamp in milliseconds. */
	updated_at: number;
	/** Whether the user has a password set. */
	password_enabled: boolean;
	/** Whether two-factor authentication is enabled for the user. */
	two_factor_enabled: boolean;
	/** Whether authenticator-app (TOTP) two-factor is enabled for the user. */
	totp_enabled: boolean;
	/** Whether backup codes are enabled for the user. */
	backup_code_enabled: boolean;
}

/** The result of counting users. */
export interface ClerkUserCount {
	/** The object type, always `"total_count"`. */
	object: "total_count";
	/** How many users matched. */
	total_count: number;
}

/** What Clerk returns after deleting an object. */
export interface ClerkDeletedObject {
	/** The type of the deleted object. */
	object: string;
	/** The identifier of the deleted object. */
	id: string;
	/** The slug of the deleted object, when it has one. */
	slug?: string;
	/** Whether the object was deleted. */
	deleted: boolean;
}

/** Filters and paging for listing users; each array filter is sent as a repeated query parameter. */
export interface ClerkUsersListParams {
	/** The maximum number of users to return. */
	limit?: number;
	/** How many users to skip before returning results. */
	offset?: number;
	/** Only users with one of these email addresses. */
	email_address?: string[];
	/** Only users with one of these phone numbers. */
	phone_number?: string[];
	/** Only users with one of these usernames. */
	username?: string[];
	/** Only users with one of these external ids. */
	external_id?: string[];
	/** Only users with one of these user ids. */
	user_id?: string[];
	/** A search term matched against the user's fields. */
	query?: string;
	/** Only users active since this Unix timestamp in milliseconds. */
	last_active_at_since?: number;
	/** The sort order, as Clerk's `order_by` value (for example `-created_at`). */
	order_by?: string;
}

/** The fields accepted when creating a Clerk user. */
export interface CreateClerkUserInput {
	/** The identifier the user has in your own system. */
	external_id?: string;
	/** The user's first name. */
	first_name?: string;
	/** The user's last name. */
	last_name?: string;
	/** Email addresses to attach to the user. */
	email_address?: string[];
	/** Phone numbers to attach to the user. */
	phone_number?: string[];
	/** Web3 wallets to attach to the user. */
	web3_wallet?: string[];
	/** The user's username. */
	username?: string;
	/** The user's password in plain text. */
	password?: string;
	/** A password hash to import, used together with `password_hasher`. */
	password_digest?: string;
	/** The algorithm that produced `password_digest`. */
	password_hasher?: string;
	/** Whether to skip Clerk's password strength checks. */
	skip_password_checks?: boolean;
	/** Whether to allow creating the user without a password. */
	skip_password_requirement?: boolean;
	/** A TOTP secret to enroll the user in authenticator-app two-factor. */
	totp_secret?: string;
	/** Backup codes to set for the user. */
	backup_codes?: string[];
	/** Metadata readable from the frontend and backend, writable only from the backend. */
	public_metadata?: Record<string, unknown>;
	/** Metadata readable and writable only from the backend. */
	private_metadata?: Record<string, unknown>;
	/** Metadata that the frontend can also read and write. */
	unsafe_metadata?: Record<string, unknown>;
	/** The creation date to record for the user, as an ISO 8601 string. */
	created_at?: string;
}

/** The fields accepted when updating a Clerk user; only the ones given are changed. */
export interface UpdateClerkUserInput {
	/** The identifier the user has in your own system. */
	external_id?: string;
	/** The user's first name. */
	first_name?: string;
	/** The user's last name. */
	last_name?: string;
	/** The user's username. */
	username?: string;
	/** The user's new password in plain text. */
	password?: string;
	/** The id of the email address to make primary. */
	primary_email_address_id?: string;
	/** Whether to notify the user when their primary email address changes. */
	notify_primary_email_address_changed?: boolean;
	/** The id of the phone number to make primary. */
	primary_phone_number_id?: string;
	/** The id of the web3 wallet to make primary. */
	primary_web3_wallet_id?: string;
	/** The id of the uploaded image to use as the profile image. */
	profile_image_id?: string;
	/** Metadata readable from the frontend and backend, writable only from the backend. */
	public_metadata?: Record<string, unknown>;
	/** Metadata readable and writable only from the backend. */
	private_metadata?: Record<string, unknown>;
	/** Metadata that the frontend can also read and write. */
	unsafe_metadata?: Record<string, unknown>;
	/** A TOTP secret to enroll the user in authenticator-app two-factor. */
	totp_secret?: string;
	/** Backup codes to set for the user. */
	backup_codes?: string[];
	/** Whether the user may delete their own account. */
	delete_self_enabled?: boolean;
	/** Whether the user may create organizations. */
	create_organization_enabled?: boolean;
}

const PATH = "/users";

function buildUsersQuery(params: ClerkUsersListParams): string {
	const qs = new URLSearchParams();
	if (params.limit !== undefined) qs.set("limit", String(params.limit));
	if (params.offset !== undefined) qs.set("offset", String(params.offset));
	if (params.query) qs.set("query", params.query);
	if (params.order_by) qs.set("order_by", params.order_by);
	if (params.last_active_at_since !== undefined) qs.set("last_active_at_since", String(params.last_active_at_since));
	for (const v of params.email_address ?? []) qs.append("email_address", v);
	for (const v of params.phone_number ?? []) qs.append("phone_number", v);
	for (const v of params.username ?? []) qs.append("username", v);
	for (const v of params.external_id ?? []) qs.append("external_id", v);
	for (const v of params.user_id ?? []) qs.append("user_id", v);
	return qs.toString();
}

export function users(rest: RestClient) {
	return {
		list: (params: ClerkUsersListParams = {}): Promise<ClerkUser[]> => {
			const q = buildUsersQuery(params);
			return rest.request<ClerkUser[]>(q ? `${PATH}?${q}` : PATH);
		},

		count: (
			params: Pick<
				ClerkUsersListParams,
				"email_address" | "phone_number" | "username" | "external_id" | "user_id" | "query"
			> = {}
		): Promise<ClerkUserCount> => {
			const q = buildUsersQuery(params);
			return rest.request<ClerkUserCount>(q ? `${PATH}/count?${q}` : `${PATH}/count`);
		},

		get: (id: string): Promise<ClerkUser> => rest.request<ClerkUser>(`${PATH}/${id}`),

		create: (data: CreateClerkUserInput): Promise<ClerkUser> =>
			rest.request<ClerkUser>(PATH, { method: "POST", body: data }),

		update: (id: string, data: UpdateClerkUserInput): Promise<ClerkUser> =>
			rest.request<ClerkUser>(`${PATH}/${id}`, {
				method: "PATCH",
				body: data,
			}),

		delete: (id: string): Promise<ClerkDeletedObject> =>
			rest.request<ClerkDeletedObject>(`${PATH}/${id}`, {
				method: "DELETE",
			}),

		ban: (id: string): Promise<ClerkUser> => rest.request<ClerkUser>(`${PATH}/${id}/ban`, { method: "POST" }),

		unban: (id: string): Promise<ClerkUser> => rest.request<ClerkUser>(`${PATH}/${id}/unban`, { method: "POST" }),

		lock: (id: string): Promise<ClerkUser> => rest.request<ClerkUser>(`${PATH}/${id}/lock`, { method: "POST" }),

		unlock: (id: string): Promise<ClerkUser> => rest.request<ClerkUser>(`${PATH}/${id}/unlock`, { method: "POST" }),
	};
}
