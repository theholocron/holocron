import { describe, expect, it } from "vitest";
import { createInfisicalClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "infisical-test-pat";
const SCOPE = { workspaceId: "ws1", environment: "dev" };

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createInfisicalClient({ token: TOKEN, fetch }), calls };
}

describe("secrets.list", () => {
	it("GET /v3/secrets/raw with workspace query params", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					secrets: [
						{ secretKey: "DB_URL", secretValue: "postgres://..." },
					],
				},
			},
		]);
		const result = await client.secrets.list(SCOPE);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v3/secrets/raw");
		expect(calls[0]?.url).toContain("workspaceId=ws1");
		expect(calls[0]?.url).toContain("environment=dev");
		expect(calls[0]?.url).toContain("secretPath=%2F");
		expect(result.secrets?.[0]?.secretKey).toBe("DB_URL");
	});

	it("uses custom secretPath when provided", async () => {
		const { client, calls } = makeClient([{ body: { secrets: [] } }]);
		await client.secrets.list({ ...SCOPE, secretPath: "/app" });
		expect(calls[0]?.url).toContain("secretPath=%2Fapp");
	});
});

describe("secrets.get", () => {
	it("GET /v3/secrets/raw/{name} with query params", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					secret: {
						secretKey: "DB_URL",
						secretValue: "postgres://...",
					},
				},
			},
		]);
		const result = await client.secrets.get("DB_URL", SCOPE);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/v3/secrets/raw/DB_URL");
		expect(calls[0]?.url).toContain("workspaceId=ws1");
		expect(result.secret?.secretValue).toBe("postgres://...");
	});

	it("URL-encodes secret names with special characters", async () => {
		const { client, calls } = makeClient([{ body: { secret: {} } }]);
		await client.secrets.get("MY SECRET", SCOPE);
		expect(calls[0]?.url).toContain("/v3/secrets/raw/MY%20SECRET");
	});
});

describe("secrets.create", () => {
	it("POST /v3/secrets/raw/{name} with body", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.secrets.create("DB_URL", {
			...SCOPE,
			secretValue: "postgres://...",
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/v3/secrets/raw/DB_URL");
		expect(calls[0]?.body).toMatchObject({
			workspaceId: "ws1",
			environment: "dev",
			secretPath: "/",
			secretValue: "postgres://...",
			type: "shared",
		});
	});

	it("respects explicit type override", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.secrets.create("MY_KEY", {
			...SCOPE,
			secretValue: "val",
			type: "personal",
		});
		expect((calls[0]?.body as Record<string, unknown>).type).toBe(
			"personal",
		);
	});
});

describe("secrets.update", () => {
	it("PATCH /v3/secrets/raw/{name} with body", async () => {
		const { client, calls } = makeClient([{ status: 200, body: {} }]);
		await client.secrets.update("DB_URL", {
			...SCOPE,
			secretValue: "postgres://new",
		});
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toContain("/v3/secrets/raw/DB_URL");
		expect(calls[0]?.body).toMatchObject({
			workspaceId: "ws1",
			environment: "dev",
			secretPath: "/",
			secretValue: "postgres://new",
		});
		expect(calls[0]?.body).not.toHaveProperty("type");
	});
});
