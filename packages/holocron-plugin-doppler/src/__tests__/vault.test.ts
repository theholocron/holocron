import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { DopplerVault } from "../capabilities/vault.js";
import { createDopplerClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

function makeClient(responses: Array<{ status?: number; body?: unknown }>) {
	const stub = stubFetch(responses);
	const client = createDopplerClient({ token: "t", fetch: stub.fetch });
	return { client, stub };
}

describe("DopplerVault constructor", () => {
	it("throws when `project` is missing", () => {
		const { client } = makeClient([]);
		// @ts-expect-error deliberately missing project
		expect(() => new DopplerVault(client, { config: "dev" })).toThrow(/project/);
	});
	it("throws when `config` is missing", () => {
		const { client } = makeClient([]);
		// @ts-expect-error deliberately missing config
		expect(() => new DopplerVault(client, { project: "demo" })).toThrow(/config/);
	});
});

describe("DopplerVault.read", () => {
	it("hits GET /configs/config/secret with the parsed project/config/name", async () => {
		const { client, stub } = makeClient([
			{ status: 200, body: { name: "API_KEY", value: { raw: "raw-val", computed: "computed-val" } } },
		]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const value = await vault.read("doppler://demo/dev/API_KEY");
		expect(value).toBe("computed-val");
		expect(stub.calls[0]?.url).toMatch(/project=demo/);
		expect(stub.calls[0]?.url).toMatch(/config=dev/);
		expect(stub.calls[0]?.url).toMatch(/name=API_KEY/);
	});

	it("falls back to raw when computed is absent", async () => {
		const { client } = makeClient([{ status: 200, body: { value: { raw: "raw-only" } } }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const value = await vault.read("doppler://demo/dev/API_KEY");
		expect(value).toBe("raw-only");
	});

	it("rejects a reference that does not start with doppler://", async () => {
		const { client } = makeClient([]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const err = await vault.read("op://Vault/Item/field").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as Error).message).toMatch(/doppler:\/\//);
	});

	it("rejects a reference missing parts", async () => {
		const { client } = makeClient([]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const err = await vault.read("doppler://demo/dev").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as Error).message).toMatch(/missing parts/);
	});
});

describe("DopplerVault.write", () => {
	it("POSTs to /configs/config/secrets with a {name: value} body", async () => {
		const { client, stub } = makeClient([{ status: 200, body: {} }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		await vault.write("doppler://demo/dev/API_KEY", "dp.pt.new");
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.url).toMatch(/\/configs\/config\/secrets/);
		expect(stub.calls[0]?.body).toEqual({
			project: "demo",
			config: "dev",
			secrets: { API_KEY: "dp.pt.new" },
		});
	});
});

describe("DopplerVault.list", () => {
	it("returns secret names from GET /configs/config/secrets", async () => {
		const { client, stub } = makeClient([
			{
				status: 200,
				body: {
					secrets: {
						API_KEY: { raw: "x", computed: "x" },
						DB_URL: { raw: "y", computed: "y" },
					},
				},
			},
		]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const keys = await vault.list();
		expect(keys.sort()).toEqual(["API_KEY", "DB_URL"]);
		expect(stub.calls[0]?.url).toMatch(/project=demo/);
		expect(stub.calls[0]?.url).toMatch(/config=dev/);
	});

	it("returns [] when the response has no secrets", async () => {
		const { client } = makeClient([{ status: 200, body: {} }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		expect(await vault.list()).toEqual([]);
	});
});

describe("DopplerVault.environments", () => {
	it("lists environment slugs from GET /environments", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: {
					environments: [
						{ id: "dev", name: "Development", slug: "dev" },
						{ id: "prd", name: "Production", slug: "prd" },
					],
				},
			},
		]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		expect(await vault.environments()).toEqual(["dev", "prd"]);
	});

	it("returns [] when the response has no environments", async () => {
		const { client } = makeClient([{ status: 200, body: {} }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		expect(await vault.environments()).toEqual([]);
	});
});

describe("DopplerVault.readEnvironment", () => {
	it("returns the KEY=VALUE map from /configs/config/secrets/download", async () => {
		const { client, stub } = makeClient([{ status: 200, body: { API_KEY: "abc", DB_URL: "postgres://x" } }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const env = await vault.readEnvironment("stg");
		expect(env).toEqual({ API_KEY: "abc", DB_URL: "postgres://x" });
		expect(stub.calls[0]?.url).toMatch(/format=json/);
		expect(stub.calls[0]?.url).toMatch(/config=stg/);
	});

	it("filters non-string values defensively", async () => {
		const { client } = makeClient([{ status: 200, body: { A: "x", B: 42, C: null } }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const env = await vault.readEnvironment("dev");
		expect(env).toEqual({ A: "x" });
	});
});

describe("DopplerVault.ensureProject", () => {
	it("returns alreadyExists:false when the create succeeds", async () => {
		const { client, stub } = makeClient([{ status: 200, body: { project: { name: "demo" } } }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const result = await vault.ensureProject("demo");
		expect(result).toEqual({ alreadyExists: false });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.body).toMatchObject({ name: "demo" });
	});

	it("returns alreadyExists:true on 409", async () => {
		const { client } = makeClient([{ status: 409, body: { messages: ["project already exists"] } }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const result = await vault.ensureProject("demo");
		expect(result).toEqual({ alreadyExists: true });
	});

	it("returns alreadyExists:true on 422 with 'already exists' message", async () => {
		const { client } = makeClient([{ status: 422, body: "project already exists" }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const result = await vault.ensureProject("demo");
		expect(result).toEqual({ alreadyExists: true });
	});

	it("rethrows unrelated errors", async () => {
		const { client } = makeClient([{ status: 500, body: "server error" }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const err = await vault.ensureProject("demo").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(500);
	});
});

describe("DopplerVault.ensureEnvironment", () => {
	it("POSTs to /environments with { project, name, slug } and returns not-existing on success", async () => {
		const { client, stub } = makeClient([{ status: 200, body: {} }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const result = await vault.ensureEnvironment("demo", "dev");
		expect(result).toEqual({ alreadyExists: false });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.body).toEqual({ project: "demo", name: "dev", slug: "dev" });
	});

	it("returns alreadyExists:true on 409", async () => {
		const { client } = makeClient([{ status: 409, body: {} }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		expect(await vault.ensureEnvironment("demo", "dev")).toEqual({ alreadyExists: true });
	});

	it("returns alreadyExists:true on Doppler's actual 400 'already exists' response", async () => {
		const { client } = makeClient([
			{
				status: 400,
				body: `{"messages":["Environment with identifier dev already exists"],"success":false}`,
			},
		]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		expect(await vault.ensureEnvironment("demo", "dev")).toEqual({ alreadyExists: true });
	});

	it("rethrows a 400 that is NOT an already-exists error", async () => {
		const { client } = makeClient([{ status: 400, body: `{"messages":["Invalid slug"],"success":false}` }]);
		const vault = new DopplerVault(client, { project: "demo", config: "dev" });
		const err = await vault.ensureEnvironment("demo", "dev").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(400);
	});
});
