import type { SlackRestClient } from "../utils.js";

export interface SlackAuthTest {
	ok: true;
	team: string;
	user: string;
}

export function auth(rest: SlackRestClient) {
	return {
		test: (): Promise<SlackAuthTest> => rest.call<SlackAuthTest>("auth.test", {}),
	};
}
