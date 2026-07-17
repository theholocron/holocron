import { describe, expect, it } from "vitest";
import { createDopplerClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "dp.st.test.abc123";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createDopplerClient({ token: TOKEN, fetch }), calls };
}

describe("me.get", () => {
	it("GET /me", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					type: "service",
					slug: "my-workplace",
					workplace: { name: "My Workplace", slug: "my-workplace" },
				},
			},
		]);
		const result = await client.me.get();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/me");
		expect(result.type).toBe("service");
		expect(result.workplace?.name).toBe("My Workplace");
	});
});
