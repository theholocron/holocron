import { createClerkRestClient, type ClerkClientOptions } from "./utils.js";
import { users } from "./users/users.js";

export type { ClerkClientOptions } from "./utils.js";

export type {
	ClerkDeletedObject,
	ClerkEmailAddress,
	ClerkPhoneNumber,
	ClerkUser,
	ClerkUserCount,
	ClerkUsersListParams,
	CreateClerkUserInput,
	UpdateClerkUserInput,
} from "./users/users.js";

export function createClerkClient(opts: ClerkClientOptions) {
	const rest = createClerkRestClient(opts);
	return {
		users: users(rest),
	};
}

export type ClerkClient = ReturnType<typeof createClerkClient>;
