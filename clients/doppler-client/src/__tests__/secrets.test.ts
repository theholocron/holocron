import { describe, expect, it } from "vitest";
import { createDopplerClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "dp.st.test.abc123";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createDopplerClient({ token: TOKEN, fetch }), calls };
}

describe("secrets.get", () => {
	it("GET /configs/config/secret with project, config, name params", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					name: "DB_URL",
					value: {
						raw: "postgres://...",
						computed: "postgres://...",
					},
				},
			},
		]);
		const result = await client.secrets.get("my-project", "dev", "DB_URL");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/configs/config/secret");
		expect(calls[0]?.url).toContain("project=my-project");
		expect(calls[0]?.url).toContain("config=dev");
		expect(calls[0]?.url).toContain("name=DB_URL");
		expect(result.value?.computed).toBe("postgres://...");
	});
});

describe("secrets.list", () => {
	it("GET /configs/config/secrets with project + config params", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					secrets: {
						DB_URL: {
							raw: "postgres://...",
							computed: "postgres://...",
						},
						API_KEY: { raw: "key123", computed: "key123" },
					},
				},
			},
		]);
		const result = await client.secrets.list("my-project", "dev");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/configs/config/secrets");
		expect(calls[0]?.url).toContain("project=my-project");
		expect(calls[0]?.url).toContain("config=dev");
		expect(result.secrets).toHaveProperty("DB_URL");
		expect(result.secrets).toHaveProperty("API_KEY");
	});
});

describe("secrets.update", () => {
	it("POST /configs/config/secrets with values map", async () => {
		const { client, calls } = makeClient([{ body: { secrets: {} } }]);
		await client.secrets.update("my-project", "dev", {
			NEW_KEY: "new-value",
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/configs/config/secrets");
		expect(calls[0]?.body).toMatchObject({
			project: "my-project",
			config: "dev",
			secrets: { NEW_KEY: "new-value" },
		});
	});
});

describe("secrets.download", () => {
	it("GET /configs/config/secrets/download always uses format=json", async () => {
		const { client, calls } = makeClient([
			{ body: { DB_URL: "postgres://...", API_KEY: "key123" } },
		]);
		const result = await client.secrets.download("my-project", "dev");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/configs/config/secrets/download");
		expect(calls[0]?.url).toContain("format=json");
		expect(result.DB_URL).toBe("postgres://...");
	});
});
