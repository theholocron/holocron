import { describe, expect, it } from "vitest";
import { createNeonClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "neon-test-pat";
const PROJECT_ID = "ancient-resonance-12345";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createNeonClient({ token: TOKEN, fetch }), calls };
}

describe("databases.list", () => {
	it("GET /projects/{projectId}/branches/{branchId}/databases", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					databases: [
						{ id: 1, name: "neondb", owner_name: "neondb_owner" },
					],
				},
			},
		]);
		const result = await client.databases.list(PROJECT_ID, "br_main");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(
			`/projects/${PROJECT_ID}/branches/br_main/databases`,
		);
		expect(result.databases[0]?.name).toBe("neondb");
	});

	it("URL-encodes branch names with slashes", async () => {
		const { client, calls } = makeClient([{ body: { databases: [] } }]);
		await client.databases.list(PROJECT_ID, "feat/x");
		expect(calls[0]?.url).toContain("/branches/feat%2Fx/databases");
	});
});

describe("databases.runSql", () => {
	it("POST /projects/{projectId}/branches/{branchId}/databases/{dbName}/run_sql", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.databases.runSql(
			PROJECT_ID,
			"br_main",
			"neondb",
			"SELECT 1",
		);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain(
			`/projects/${PROJECT_ID}/branches/br_main/databases/neondb/run_sql`,
		);
		expect(calls[0]?.body).toEqual({ query: "SELECT 1" });
	});

	it("URL-encodes db names with special characters", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.databases.runSql(
			PROJECT_ID,
			"br_main",
			"my db",
			"SELECT 1",
		);
		expect(calls[0]?.url).toContain("/databases/my%20db/run_sql");
	});
});
