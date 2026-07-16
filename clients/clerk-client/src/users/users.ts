import type { RestClient } from "../utils.js";

export interface ClerkEmailAddress {
	id: string;
	object: "email_address";
	email_address: string;
	verification: { status: string; strategy: string } | null;
	linked_to: Array<{ id: string; type: string }>;
	created_at: number;
	updated_at: number;
}

export interface ClerkPhoneNumber {
	id: string;
	object: "phone_number";
	phone_number: string;
	reserved_for_second_factor: boolean;
	default_second_factor: boolean;
	verification: { status: string; strategy: string } | null;
	linked_to: Array<{ id: string; type: string }>;
	created_at: number;
	updated_at: number;
}

export interface ClerkUser {
	id: string;
	object: "user";
	external_id: string | null;
	primary_email_address_id: string | null;
	primary_phone_number_id: string | null;
	primary_web3_wallet_id: string | null;
	username: string | null;
	first_name: string | null;
	last_name: string | null;
	profile_image_url: string;
	image_url: string;
	has_image: boolean;
	public_metadata: Record<string, unknown>;
	private_metadata: Record<string, unknown>;
	unsafe_metadata: Record<string, unknown>;
	email_addresses: ClerkEmailAddress[];
	phone_numbers: ClerkPhoneNumber[];
	last_sign_in_at: number | null;
	banned: boolean;
	locked: boolean;
	lockout_expires_in_seconds: number | null;
	verification_attempts_remaining: number | null;
	created_at: number;
	updated_at: number;
	password_enabled: boolean;
	two_factor_enabled: boolean;
	totp_enabled: boolean;
	backup_code_enabled: boolean;
}

export interface ClerkUserCount {
	object: "total_count";
	total_count: number;
}

export interface ClerkDeletedObject {
	object: string;
	id: string;
	slug?: string;
	deleted: boolean;
}

export interface ClerkUsersListParams {
	limit?: number;
	offset?: number;
	email_address?: string[];
	phone_number?: string[];
	username?: string[];
	external_id?: string[];
	user_id?: string[];
	query?: string;
	last_active_at_since?: number;
	order_by?: string;
}

export interface CreateClerkUserInput {
	external_id?: string;
	first_name?: string;
	last_name?: string;
	email_address?: string[];
	phone_number?: string[];
	web3_wallet?: string[];
	username?: string;
	password?: string;
	password_digest?: string;
	password_hasher?: string;
	skip_password_checks?: boolean;
	skip_password_requirement?: boolean;
	totp_secret?: string;
	backup_codes?: string[];
	public_metadata?: Record<string, unknown>;
	private_metadata?: Record<string, unknown>;
	unsafe_metadata?: Record<string, unknown>;
	created_at?: string;
}

export interface UpdateClerkUserInput {
	external_id?: string;
	first_name?: string;
	last_name?: string;
	username?: string;
	password?: string;
	primary_email_address_id?: string;
	notify_primary_email_address_changed?: boolean;
	primary_phone_number_id?: string;
	primary_web3_wallet_id?: string;
	profile_image_id?: string;
	public_metadata?: Record<string, unknown>;
	private_metadata?: Record<string, unknown>;
	unsafe_metadata?: Record<string, unknown>;
	totp_secret?: string;
	backup_codes?: string[];
	delete_self_enabled?: boolean;
	create_organization_enabled?: boolean;
}

const PATH = "/users";

function buildUsersQuery(params: ClerkUsersListParams): string {
	const qs = new URLSearchParams();
	if (params.limit !== undefined) qs.set("limit", String(params.limit));
	if (params.offset !== undefined) qs.set("offset", String(params.offset));
	if (params.query) qs.set("query", params.query);
	if (params.order_by) qs.set("order_by", params.order_by);
	if (params.last_active_at_since !== undefined)
		qs.set("last_active_at_since", String(params.last_active_at_since));
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
				| "email_address"
				| "phone_number"
				| "username"
				| "external_id"
				| "user_id"
				| "query"
			> = {},
		): Promise<ClerkUserCount> => {
			const q = buildUsersQuery(params);
			return rest.request<ClerkUserCount>(
				q ? `${PATH}/count?${q}` : `${PATH}/count`,
			);
		},

		get: (id: string): Promise<ClerkUser> =>
			rest.request<ClerkUser>(`${PATH}/${id}`),

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

		ban: (id: string): Promise<ClerkUser> =>
			rest.request<ClerkUser>(`${PATH}/${id}/ban`, { method: "POST" }),

		unban: (id: string): Promise<ClerkUser> =>
			rest.request<ClerkUser>(`${PATH}/${id}/unban`, { method: "POST" }),

		lock: (id: string): Promise<ClerkUser> =>
			rest.request<ClerkUser>(`${PATH}/${id}/lock`, { method: "POST" }),

		unlock: (id: string): Promise<ClerkUser> =>
			rest.request<ClerkUser>(`${PATH}/${id}/unlock`, { method: "POST" }),
	};
}
