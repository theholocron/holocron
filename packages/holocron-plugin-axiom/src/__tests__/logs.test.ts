import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { AxiomLogs } from "../capabilities/logs.js";
import { createAxiomClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://api.axiom.test";

function makeLogs(responses: Parameters<typeof stubFetch>[0], opts: { dataset?: string } = {}) {
	const { fetch, calls } = stubFetch(responses);
	const client = createAxiomClient({ token: "xaat-tok", baseUrl: BASE, fetch });
	return { logs: new AxiomLogs(client, opts), calls };
}

const dataset = { id: "d1", name: "holocron-ci", description: "Managed by holocron" };

describe("AxiomLogs.describe", () => {
	it("returns the axiom provider with both env keys", async () => {
		const { logs } = makeLogs([]);
		const result = await logs.describe();
		expect(result.provider).toBe("axiom");
		expect(result.envKeys).toEqual(["HOLOCRON_AXIOM_TOKEN", "HOLOCRON_AXIOM_DATASET"]);
	});
});

describe("AxiomLogs.whoami", () => {
	it("fetches the configured dataset and reports it reachable", async () => {
		const { logs, calls } = makeLogs([{ body: dataset }], { dataset: "holocron-ci" });
		const result = await logs.whoami();
		expect(calls[0]?.url).toBe(`${BASE}/v2/datasets/holocron-ci`);
		expect(result).toEqual({ ok: true, dataset: "holocron-ci" });
	});

	it("throws when no dataset is configured", async () => {
		const { logs } = makeLogs([]);
		const err = await logs.whoami().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/HOLOCRON_AXIOM_DATASET/);
	});

	it("propagates a ProviderApiError when the dataset is unreachable", async () => {
		const { logs } = makeLogs([{ status: 403, body: { message: "forbidden" } }], { dataset: "holocron-ci" });
		await expect(logs.whoami()).rejects.toBeInstanceOf(ProviderApiError);
	});
});

describe("AxiomLogs.ensureDataset", () => {
	it("returns alreadyExists:true when the dataset is found", async () => {
		const { logs, calls } = makeLogs([{ body: dataset }]);
		const result = await logs.ensureDataset("holocron-ci");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toBe(`${BASE}/v2/datasets/holocron-ci`);
		expect(result).toEqual({ alreadyExists: true });
	});

	it("creates the dataset when GET returns 404", async () => {
		const { logs, calls } = makeLogs([
			{ status: 404, body: { message: "not found" } }, // GET → 404
			{ body: dataset }, // POST create
		]);
		const result = await logs.ensureDataset("holocron-ci");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toBe(`${BASE}/v2/datasets`);
		expect(calls[1]?.body).toMatchObject({ name: "holocron-ci", description: "Managed by holocron" });
		expect(result).toEqual({ alreadyExists: false });
	});

	it("rethrows non-404 errors from the existence check", async () => {
		const { logs } = makeLogs([{ status: 500, body: { message: "boom" } }]);
		await expect(logs.ensureDataset("holocron-ci")).rejects.toBeInstanceOf(ProviderApiError);
	});
});
