import type { SlackRestClient } from "../utils.js";

interface SlackPostMessageResponse {
	ok: true;
}

export function chat(rest: SlackRestClient) {
	return {
		/** Send a message to a channel (`POST chat.postMessage`). */
		postMessage: async (channel: string, text: string): Promise<void> => {
			await rest.call<SlackPostMessageResponse>("chat.postMessage", { channel, text });
		},
	};
}
