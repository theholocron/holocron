import { describe, expect, it } from "vitest";
import { createDopplerClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "dp.st.test.abc123";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createDopplerClient({ token: TOKEN, fetch }), calls };
}

describe("environments.list", () => {
	it("GET /environments with project param", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					environments: [
						{ id: "1", name: "Development", slug: "dev" },
						{ id: "2", name: "Production", slug: "prd" },
					],
				},
			},
		]);
		const result = await client.environments.list("my-project");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/environments");
		expect(calls[0]?.url).toContain("project=my-project");
		expect(result.environments).toHaveLength(2);
		expect(result.environments?.[0]?.slug).toBe("dev");
	});
});

describe("environments.create", () => {
	it("POST /environments with project, name, slug", async () => {
		const { client, calls } = makeClient([
			{ body: { environments: [{ name: "Staging", slug: "stg" }] } },
		]);
		await client.environments.create("my-project", "Staging", "stg");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/environments");
		expect(calls[0]?.body).toMatchObject({
			project: "my-project",
			name: "Staging",
			slug: "stg",
		});
	});
});
