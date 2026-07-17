import { describe, expect, it } from "vitest";
import { createDopplerClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "dp.st.test.abc123";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createDopplerClient({ token: TOKEN, fetch }), calls };
}

describe("projects.create", () => {
	it("POST /projects with name", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					project: {
						id: "1",
						name: "my-project",
						slug: "my-project",
					},
				},
			},
		]);
		await client.projects.create("my-project");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/projects");
		expect(calls[0]?.body).toMatchObject({ name: "my-project" });
	});

	it("includes description when provided", async () => {
		const { client, calls } = makeClient([{ body: { project: {} } }]);
		await client.projects.create("my-project", "Managed by holocron");
		expect(calls[0]?.body).toMatchObject({
			name: "my-project",
			description: "Managed by holocron",
		});
	});

	it("omits description when not provided", async () => {
		const { client, calls } = makeClient([{ body: { project: {} } }]);
		await client.projects.create("my-project");
		expect(calls[0]?.body).not.toHaveProperty("description");
	});
});
