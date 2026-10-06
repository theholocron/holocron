import { describe, expect, it } from "vitest";

import { createNetlifyClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "netlify-test-token";

describe("createNetlifyClient", () => {
	it("sends Bearer authorization + accept headers", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		await client.sites.list();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/json");
	});

	it("targets the Netlify base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: [] }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		await client.sites.list();
		expect(calls[0]?.url).toContain("https://api.netlify.com/api/v1");
	});

	it("exposes sites, deploys, env, and user resources", () => {
		const client = createNetlifyClient({ token: TOKEN });
		expect(typeof client.sites.list).toBe("function");
		expect(typeof client.deploys.get).toBe("function");
		expect(typeof client.env.list).toBe("function");
		expect(typeof client.user.get).toBe("function");
	});
});
