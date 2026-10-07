import type { SlackRestClient } from "../utils.js";

interface SlackPostMessageResponse {
	ok: true;
}

export function chat(rest: SlackRestClient) {
	return {
		postMessage: async (channel: string, text: string): Promise<void> => {
			await rest.call<SlackPostMessageResponse>("chat.postMessage", { channel, text });
		},
	};
}
