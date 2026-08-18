import { createRestClient, type RestClient } from "@theholocron/cli";

export interface PostHogClientOptions {
	token: string;
	/** PostHog instance host. Default: https://app.posthog.com */
	host?: string;
	/** Override base URL for tests (takes precedence over host). */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PostHogProject {
	id: number;
	name: string;
	api_token: string;
}

export interface PostHogUser {
	email: string;
	organization: { slug: string; name: string };
}

export interface PostHogClient {
	users: {
		me(): Promise<PostHogUser>;
	};
	projects: {
		list(): Promise<{ results: PostHogProject[] }>;
		create(input: { name: string }): Promise<PostHogProject>;
	};
}

export function createPostHogClient({ token, host, baseUrl, fetch: fetchImpl }: PostHogClientOptions): PostHogClient {
	const base = baseUrl ?? host ?? "https://app.posthog.com";
	const client: RestClient = createRestClient({ baseUrl: base, token, vendor: "PostHog", fetch: fetchImpl });

	return {
		users: {
			me: () => client.request<PostHogUser>("/api/users/@me/"),
		},
		projects: {
			list: () => client.request<{ results: PostHogProject[] }>("/api/projects/"),
			create: (input) => client.request<PostHogProject>("/api/projects/", { method: "POST", body: input }),
		},
	};
}
