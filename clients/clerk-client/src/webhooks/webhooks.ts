import type { RestClient } from "../utils.js";

/** The Svix application Clerk keeps for the instance's webhooks. */
export interface ClerkSvixApp {
	/** The identifier of the Svix application. */
	svix_app_id?: string;
}

/** Older Clerk instances return `svix_url`; newer return `url`. */
export interface ClerkSvixUrl {
	/** The Svix dashboard URL, as returned by newer Clerk instances. */
	url?: string;
	/** The Svix dashboard URL, as returned by older Clerk instances. */
	svix_url?: string;
}

const PATH = "/webhooks";

export function webhooks(rest: RestClient) {
	return {
		ensureSvixApp: (): Promise<ClerkSvixApp> => rest.request<ClerkSvixApp>(`${PATH}/svix`, { method: "POST" }),

		getSvixUrl: (): Promise<ClerkSvixUrl> => rest.request<ClerkSvixUrl>(`${PATH}/svix_url`, { method: "POST" }),
	};
}
