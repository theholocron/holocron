import type { RestClient } from "../utils.js";

export interface ClerkSvixApp {
	svix_app_id?: string;
}

/** Older Clerk instances return `svix_url`; newer return `url`. */
export interface ClerkSvixUrl {
	url?: string;
	svix_url?: string;
}

const PATH = "/webhooks";

export function webhooks(rest: RestClient) {
	return {
		ensureSvixApp: (): Promise<ClerkSvixApp> =>
			rest.request<ClerkSvixApp>(`${PATH}/svix`, { method: "POST" }),

		getSvixUrl: (): Promise<ClerkSvixUrl> =>
			rest.request<ClerkSvixUrl>(`${PATH}/svix_url`, { method: "POST" }),
	};
}
