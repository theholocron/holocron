import { auth } from "./auth/auth.js";
import { chat } from "./chat/chat.js";
import { createSlackRestClient, type SlackClientOptions } from "./utils.js";

export type { SlackAuthTest } from "./auth/auth.js";
export type { SlackClientOptions } from "./utils.js";

export function createSlackClient(opts: SlackClientOptions) {
	const rest = createSlackRestClient(opts);
	return {
		auth: auth(rest),
		chat: chat(rest),
	};
}

export type SlackClient = ReturnType<typeof createSlackClient>;
