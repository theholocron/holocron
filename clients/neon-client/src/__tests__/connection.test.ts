import { describe, expect, it } from "vitest";
import { createNeonClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "neon-test-pat";
const PROJECT_ID = "ancient-resonance-12345";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createNeonClient({ token: TOKEN, fetch }), calls };
}

describe("connection.uri", () => {
	it("GET /projects/{projectId}/connection_uri with query params", async () => {
		const { client, calls } = makeClient([
			{ body: { uri: "postgresql://owner:pass@host/neondb" } },
		]);
		const result = await client.connection.uri(PROJECT_ID, {
			branch_id: "br_main",
			database_name: "neondb",
			role_name: "neondb_owner",
		});
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain(
			`/projects/${PROJECT_ID}/connection_uri`,
		);
		expect(calls[0]?.url).toContain("branch_id=br_main");
		expect(calls[0]?.url).toContain("database_name=neondb");
		expect(calls[0]?.url).toContain("role_name=neondb_owner");
		expect(result.uri).toBe("postgresql://owner:pass@host/neondb");
	});

	it("passes pooled=true when requested", async () => {
		const { client, calls } = makeClient([
			{ body: { uri: "postgresql://...-pooler" } },
		]);
		await client.connection.uri(PROJECT_ID, {
			branch_id: "br_main",
			database_name: "neondb",
			role_name: "owner",
			pooled: "true",
		});
		expect(calls[0]?.url).toContain("pooled=true");
	});
});
