import { describe, expect, it } from "vitest";
import { createNeonClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "neon-test-pat";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createNeonClient({ token: TOKEN, fetch }), calls };
}

describe("users.me", () => {
	it("GET /users/me", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "u1", email: "user@example.com" } },
		]);
		const result = await client.users.me();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/users/me");
		expect(result.email).toBe("user@example.com");
	});
});
