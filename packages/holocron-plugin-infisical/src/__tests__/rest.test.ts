import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { InfisicalRestClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("InfisicalRestClient", () => {
	it("sends bearer + accept headers and returns the parsed body", async () => {
		const stub = stubFetch([{ status: 200, body: { ok: true } }]);
		const client = new InfisicalRestClient({ token: "t", fetch: stub.fetch });
		const res = await client.request<{ ok: boolean }>("/me");
		expect(res.ok).toBe(true);
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer t");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
	});

	it("serializes body as JSON and sets content-type when present", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const client = new InfisicalRestClient({ token: "t", fetch: stub.fetch });
		await client.request<unknown>("/resource", { method: "POST", body: { name: "demo" } });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toEqual({ name: "demo" });
	});

	it("returns undefined on 204", async () => {
		const stub = stubFetch([{ status: 204 }]);
		const client = new InfisicalRestClient({ token: "t", fetch: stub.fetch });
		expect(await client.request<unknown>("/whatever")).toBeUndefined();
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["invalid"] } }]);
		const client = new InfisicalRestClient({ token: "bad", fetch: stub.fetch });
		const err = await client.request<unknown>("/me").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = new InfisicalRestClient({ token: "t", fetch: throwing });
		const err = await client.request<unknown>("/me").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
	});

	it("trims trailing slashes from the base URL", () => {
		const client = new InfisicalRestClient({ token: "t", baseUrl: "https://app.infisical.com/api//" });
		expect(client.baseUrl).toBe("https://app.infisical.com/api");
	});
});
