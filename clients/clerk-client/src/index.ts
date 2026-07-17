import { createClerkRestClient, type ClerkClientOptions } from "./utils.js";
import { instance } from "./instance/instance.js";
import { users } from "./users/users.js";
import { webhooks } from "./webhooks/webhooks.js";

export type { ClerkClientOptions } from "./utils.js";

export type { ClerkInstance } from "./instance/instance.js";

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

export type { ClerkSvixApp, ClerkSvixUrl } from "./webhooks/webhooks.js";

export function createClerkClient(opts: ClerkClientOptions) {
	const rest = createClerkRestClient(opts);
	return {
		instance: instance(rest),
		users: users(rest),
		webhooks: webhooks(rest),
	};
}

export type ClerkClient = ReturnType<typeof createClerkClient>;
