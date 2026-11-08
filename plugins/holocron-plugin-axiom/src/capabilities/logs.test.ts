import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createAxiomClient } from "../rest.js";
import { AxiomLogs } from "./logs.js";

const BASE = "https://api.axiom.test";

function makeLogs(responses: Parameters<typeof stubFetch>[0], opts: { dataset?: string } = {}) {
	const { fetch, calls } = stubFetch(responses);
	const client = createAxiomClient({ token: "xaat-tok", baseUrl: BASE, fetch });
	return { logs: new AxiomLogs(() => client, opts), calls };
}

const dataset = { id: "d1", name: "my-dataset", description: "Managed by holocron" };

describe("AxiomLogs.describe", () => {
	it("returns the axiom provider with both env keys", async () => {
		const { logs } = makeLogs([]);
		const result = await logs.describe();
		expect(result.provider).toBe("axiom");
		expect(result.envKeys).toEqual(["HOLOCRON_AXIOM_TOKEN", "HOLOCRON_AXIOM_DATASET"]);
	});

	it("does not touch the client (no token needed)", async () => {
		const client = () => {
			throw new Error("client should not be built for describe()");
		};
		const logs = new AxiomLogs(client, {});
		await expect(logs.describe()).resolves.toMatchObject({ provider: "axiom" });
	});
});

describe("AxiomLogs.whoami", () => {
	it("fetches the configured dataset and reports it reachable", async () => {
		const { logs, calls } = makeLogs([{ body: dataset }], { dataset: "my-dataset" });
		const result = await logs.whoami();
		expect(calls[0]?.url).toBe(`${BASE}/v2/datasets/my-dataset`);
		expect(result).toEqual({ ok: true, dataset: "my-dataset" });
	});

	it("throws when no dataset is configured", async () => {
		const { logs } = makeLogs([]);
		const err = await logs.whoami().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/HOLOCRON_AXIOM_DATASET/);
	});

	it("propagates a ProviderApiError when the dataset is unreachable", async () => {
		const { logs } = makeLogs([{ status: 403, body: { message: "forbidden" } }], { dataset: "my-dataset" });
		await expect(logs.whoami()).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("AxiomLogs.ensureDataset", () => {
	it("returns alreadyExists:true when the dataset is found", async () => {
		const { logs, calls } = makeLogs([{ body: dataset }]);
		const result = await logs.ensureDataset("my-dataset");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toBe(`${BASE}/v2/datasets/my-dataset`);
		expect(result).toEqual({ alreadyExists: true });
	});

	it("creates the dataset when GET returns 404", async () => {
		const { logs, calls } = makeLogs([
			{ status: 404, body: { message: "not found" } }, // GET → 404
			{ body: dataset }, // POST create
		]);
		const result = await logs.ensureDataset("my-dataset");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toBe(`${BASE}/v2/datasets`);
		expect(calls[1]?.body).toMatchObject({ name: "my-dataset", description: "Managed by holocron" });
		expect(result).toEqual({ alreadyExists: false });
	});

	it("rethrows non-404 errors from the existence check", async () => {
		const { logs } = makeLogs([{ status: 500, body: { message: "boom" } }]);
		await expect(logs.ensureDataset("my-dataset")).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("AxiomLogs.readDataset", () => {
	it("reads the dataset with a GET and reports its retention in days", async () => {
		const { logs, calls } = makeLogs([{ body: { ...dataset, retentionDays: 30, useRetentionPeriod: true } }]);
		expect(await logs.readDataset("my-dataset")).toEqual({ exists: true, retentionDays: 30 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toBe(`${BASE}/v2/datasets/my-dataset`);
	});

	it("reports no retention when the API returns none, or says it does not apply", async () => {
		expect(await makeLogs([{ body: dataset }]).logs.readDataset("d")).toEqual({ exists: true });
		const off = { ...dataset, retentionDays: 90, useRetentionPeriod: false };
		expect(await makeLogs([{ body: off }]).logs.readDataset("d")).toEqual({ exists: true });
	});

	it("reports a dataset that is not there as missing, and never creates it", async () => {
		const { logs, calls } = makeLogs([{ status: 404, body: { message: "not found" } }]);
		expect(await logs.readDataset("gone")).toEqual({ exists: false });
		expect(calls.map((c) => c.method)).toEqual(["GET"]);
	});

	it("rethrows any other failure", async () => {
		const { logs } = makeLogs([{ status: 403, body: { message: "forbidden" } }]);
		await expect(logs.readDataset("d")).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("AxiomLogs.checkToken", () => {
	it("accepts the token when a dataset that cannot exist is a 404", async () => {
		const { logs, calls } = makeLogs([{ status: 404, body: { message: "not found" } }]);
		expect(await logs.checkToken()).toEqual({ ok: true });
		expect(calls[0]?.url).toBe(`${BASE}/v2/datasets/holocron-token-check`);
	});

	it("accepts the token when the dataset is found", async () => {
		expect(await makeLogs([{ body: dataset }]).logs.checkToken()).toEqual({ ok: true });
	});

	it("reports a 401 as a refused token", async () => {
		const { logs } = makeLogs([{ status: 401, body: { message: "unauthorized" } }]);
		expect(await logs.checkToken()).toEqual({ ok: false, reason: "Axiom refused the token (401)" });
	});

	it("throws on what says nothing about the token (a 403)", async () => {
		const { logs } = makeLogs([{ status: 403, body: { message: "forbidden" } }]);
		await expect(logs.checkToken()).rejects.toBeInstanceOf(ProviderApiError);
	});

	it("throws when there is no token to try", async () => {
		const logs = new AxiomLogs(() => {
			throw new Error("no Axiom token found");
		}, {});
		await expect(logs.checkToken()).rejects.toThrow("no Axiom token found");
	});
});
