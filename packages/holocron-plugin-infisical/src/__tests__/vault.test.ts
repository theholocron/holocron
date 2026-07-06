import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { InfisicalVault } from "../capabilities/vault.js";
import { InfisicalRestClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

function makeClient(responses: Array<{ status?: number; body?: unknown }>) {
	const stub = stubFetch(responses);
	const client = new InfisicalRestClient({ token: "t", fetch: stub.fetch });
	return { client, stub };
}

describe("InfisicalVault constructor", () => {
	it("throws when `workspace` is missing", () => {
		const { client } = makeClient([]);
		// @ts-expect-error deliberately missing workspace
		expect(() => new InfisicalVault(client, { environment: "dev" })).toThrow(/workspace/);
	});
	it("throws when `environment` is missing", () => {
		const { client } = makeClient([]);
		// @ts-expect-error deliberately missing environment
		expect(() => new InfisicalVault(client, { workspace: "ws-1" })).toThrow(/environment/);
	});
});

describe("InfisicalVault.read", () => {
	it("hits GET /v3/secrets/raw/{name} with the parsed workspace/env/name", async () => {
		const { client, stub } = makeClient([
			{ status: 200, body: { secret: { secretKey: "API_KEY", secretValue: "abc" } } },
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		const value = await vault.read("infisical://ws-1/dev/API_KEY");
		expect(value).toBe("abc");
		expect(stub.calls[0]?.url).toMatch(/\/v3\/secrets\/raw\/API_KEY/);
		expect(stub.calls[0]?.url).toMatch(/workspaceId=ws-1/);
		expect(stub.calls[0]?.url).toMatch(/environment=dev/);
	});

	it("returns empty string when secretValue is absent", async () => {
		const { client } = makeClient([{ status: 200, body: { secret: {} } }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.read("infisical://ws-1/dev/EMPTY")).toBe("");
	});

	it("rejects a reference that doesn't start with infisical://", async () => {
		const { client } = makeClient([]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		try {
			await vault.read("doppler://x/y/z");
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as Error).message).toMatch(/infisical:\/\//);
		}
	});

	it("rejects a reference missing parts", async () => {
		const { client } = makeClient([]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		try {
			await vault.read("infisical://ws-1/dev");
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as Error).message).toMatch(/missing parts/);
		}
	});
});

describe("InfisicalVault.write", () => {
	it("POSTs to /v3/secrets/raw/{name} with a create body", async () => {
		const { client, stub } = makeClient([{ status: 200, body: {} }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		await vault.write("infisical://ws-1/dev/API_KEY", "new-val");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toMatch(/\/v3\/secrets\/raw\/API_KEY/);
		expect(stub.calls[0]?.body).toMatchObject({
			workspaceId: "ws-1",
			environment: "dev",
			secretValue: "new-val",
			type: "shared",
		});
	});

	it("falls back to PATCH when POST returns 'already exists' (upsert semantics)", async () => {
		const { client, stub } = makeClient([
			{ status: 400, body: `{"message":"Secret already exists"}` },
			{ status: 200, body: {} },
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		await vault.write("infisical://ws-1/dev/API_KEY", "new-val");
		expect(stub.calls).toHaveLength(2);
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[1]?.method).toBe("PATCH");
		expect(stub.calls[1]?.body).toMatchObject({ secretValue: "new-val" });
	});

	it("rethrows a non-conflict error from POST unchanged", async () => {
		const { client } = makeClient([{ status: 500, body: "server error" }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		try {
			await vault.write("infisical://ws-1/dev/API_KEY", "v");
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(500);
		}
	});
});

describe("InfisicalVault.list", () => {
	it("returns secret keys from GET /v3/secrets/raw at the default workspace + environment", async () => {
		const { client, stub } = makeClient([
			{
				status: 200,
				body: {
					secrets: [
						{ secretKey: "API_KEY", secretValue: "x" },
						{ secretKey: "DB_URL", secretValue: "y" },
					],
				},
			},
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		const keys = await vault.list();
		expect(keys.sort()).toEqual(["API_KEY", "DB_URL"]);
		expect(stub.calls[0]?.url).toMatch(/workspaceId=ws-1/);
		expect(stub.calls[0]?.url).toMatch(/environment=dev/);
		expect(stub.calls[0]?.url).toMatch(/secretPath=%2F/);
	});

	it("returns [] when the response has no secrets", async () => {
		const { client } = makeClient([{ status: 200, body: {} }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.list()).toEqual([]);
	});
});

describe("InfisicalVault.environments", () => {
	it("returns env slugs from GET /v1/workspace/{id}", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: {
					workspace: {
						environments: [
							{ id: "e1", name: "Development", slug: "dev" },
							{ id: "e2", name: "Production", slug: "prd" },
						],
					},
				},
			},
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.environments()).toEqual(["dev", "prd"]);
	});

	it("returns [] when the workspace has no environments key", async () => {
		const { client } = makeClient([{ status: 200, body: {} }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.environments()).toEqual([]);
	});
});

describe("InfisicalVault.readEnvironment", () => {
	it("returns a KEY=VALUE map for the given env", async () => {
		const { client, stub } = makeClient([
			{
				status: 200,
				body: {
					secrets: [
						{ secretKey: "API_KEY", secretValue: "a" },
						{ secretKey: "DB_URL", secretValue: "b" },
					],
				},
			},
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		const env = await vault.readEnvironment("stg");
		expect(env).toEqual({ API_KEY: "a", DB_URL: "b" });
		expect(stub.calls[0]?.url).toMatch(/environment=stg/);
	});

	it("skips entries missing a key or non-string value", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: {
					secrets: [
						{ secretKey: "A", secretValue: "x" },
						{ secretValue: "no-key" },
						{ secretKey: "C", secretValue: 42 },
					],
				},
			},
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.readEnvironment("dev")).toEqual({ A: "x" });
	});
});

describe("InfisicalVault.ensureProject", () => {
	it("returns alreadyExists:false when POST /v2/workspace succeeds", async () => {
		const { client, stub } = makeClient([{ status: 200, body: { workspace: { name: "demo" } } }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		const result = await vault.ensureProject("demo");
		expect(result).toEqual({ alreadyExists: false });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.body).toMatchObject({ projectName: "demo" });
	});

	it("returns alreadyExists:true on 400 with 'already exists' body", async () => {
		const { client } = makeClient([
			{ status: 400, body: `{"message":"A workspace with that name already exists"}` },
		]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.ensureProject("demo")).toEqual({ alreadyExists: true });
	});

	it("returns alreadyExists:true on 409", async () => {
		const { client } = makeClient([{ status: 409, body: {} }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.ensureProject("demo")).toEqual({ alreadyExists: true });
	});

	it("rethrows unrelated errors", async () => {
		const { client } = makeClient([{ status: 500, body: "server error" }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		try {
			await vault.ensureProject("demo");
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(500);
		}
	});
});

describe("InfisicalVault.ensureEnvironment", () => {
	it("POSTs to /v1/workspace/{id}/environments and returns not-existing on success", async () => {
		const { client, stub } = makeClient([{ status: 200, body: {} }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		const result = await vault.ensureEnvironment("ws-1", "dev");
		expect(result).toEqual({ alreadyExists: false });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toMatch(/\/v1\/workspace\/ws-1\/environments/);
		expect(stub.calls[0]?.body).toEqual({ environmentName: "dev", environmentSlug: "dev" });
	});

	it("returns alreadyExists:true on 'duplicate' body", async () => {
		const { client } = makeClient([{ status: 400, body: `{"message":"Duplicate environment slug"}` }]);
		const vault = new InfisicalVault(client, { workspace: "ws-1", environment: "dev" });
		expect(await vault.ensureEnvironment("ws-1", "dev")).toEqual({ alreadyExists: true });
	});
});
