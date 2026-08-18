import { createPostHogClient } from "@theholocron/posthog-client";
import { describe, expect, it } from "vitest";

import { PostHogAnalytics } from "../capabilities/analytics.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://posthog.test";
const TOKEN = "phx_test";

const user = { email: "newton@example.com", organization: { slug: "theholocron", name: "The Holocron" } };
const project = { id: 1, name: "my-app", api_token: "phc_abc123" };

function makeAnalytics(responses: Parameters<typeof stubFetch>[0], opts: { host?: string } = {}) {
	const { fetch, calls } = stubFetch(responses);
	const client = createPostHogClient({ token: TOKEN, baseUrl: BASE, fetch });
	return { analytics: new PostHogAnalytics(client, opts), calls };
}

describe("PostHogAnalytics.describe", () => {
	it("returns posthog provider with both env keys", async () => {
		const { analytics } = makeAnalytics([]);
		const result = await analytics.describe();
		expect(result).toEqual({
			provider: "posthog",
			envKeys: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
		});
	});
});

describe("PostHogAnalytics.whoami", () => {
	it("returns the org slug", async () => {
		const { analytics, calls } = makeAnalytics([{ body: user }]);
		const result = await analytics.whoami();
		expect(calls[0]?.url).toContain("/api/users/@me/");
		expect(result.org).toBe("theholocron");
	});
});

describe("PostHogAnalytics.ensureProject — existing", () => {
	it("returns alreadyExists:true when project name matches", async () => {
		const { analytics, calls } = makeAnalytics([{ body: { results: [project] } }]);
		const result = await analytics.ensureProject("my-app");
		expect(calls[0]?.url).toContain("/api/projects/");
		expect(calls[0]?.method).toBe("GET");
		expect(result).toEqual({ token: "phc_abc123", alreadyExists: true });
	});
});

describe("PostHogAnalytics.ensureProject — create", () => {
	it("creates project when name not found in list", async () => {
		const { analytics, calls } = makeAnalytics([{ body: { results: [] } }, { body: project }]);
		const result = await analytics.ensureProject("my-app");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("/api/projects/");
		expect(calls[1]?.body).toMatchObject({ name: "my-app" });
		expect(result).toEqual({ token: "phc_abc123", alreadyExists: false });
	});
});

describe("PostHogAnalytics.resolvedHost", () => {
	it("defaults to US cloud", () => {
		const { analytics } = makeAnalytics([]);
		expect(analytics.resolvedHost).toBe("https://app.posthog.com");
	});

	it("returns the configured host", () => {
		const { analytics } = makeAnalytics([], { host: "https://eu.posthog.com" });
		expect(analytics.resolvedHost).toBe("https://eu.posthog.com");
	});
});
