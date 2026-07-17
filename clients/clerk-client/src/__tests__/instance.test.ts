import { describe, expect, it } from "vitest";
import { createClerkClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "sk_test_abc123";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createClerkClient({ token: TOKEN, fetch });
	return { client, calls };
}

describe("instance.get", () => {
	it("GET /instance", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "ins_abc123",
					object: "instance",
					environment_type: "development",
				},
			},
		]);
		const result = await client.instance.get();
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/instance");
		expect(result.id).toBe("ins_abc123");
		expect(result.environment_type).toBe("development");
	});

	it("sends Bearer authorization header", async () => {
		const { client, calls } = makeClient([{ body: { id: "ins_1" } }]);
		await client.instance.get();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});
});
