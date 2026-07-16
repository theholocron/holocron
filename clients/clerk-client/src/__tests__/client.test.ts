import { describe, expect, it } from "vitest";
import { createClerkClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "sk_test_abc123";

describe("createClerkClient", () => {
	it("sends Bearer authorization header", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "user_1" } }]);
		const client = createClerkClient({ token: TOKEN, fetch });
		await client.users.get("user_1");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the Clerk v1 base URL", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "user_1" } }]);
		const client = createClerkClient({ token: TOKEN, fetch });
		await client.users.get("user_1");
		expect(calls[0]?.url).toContain("https://api.clerk.com/v1");
	});
});
