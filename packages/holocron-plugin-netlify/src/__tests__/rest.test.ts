import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { createNetlifyRestClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("createNetlifyRestClient", () => {
	it("sends bearer + accept headers and returns the parsed body", async () => {
		const stub = stubFetch([{ status: 200, body: { ok: true } }]);
		const client = createNetlifyRestClient({ token: "t", fetch: stub.fetch });
		const res = await client.request<{ ok: boolean }>("/me");
		expect(res.ok).toBe(true);
		expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer t");
		expect(stub.calls[0]?.headers["accept"]).toBe("application/json");
	});

	it("serializes body as JSON and sets content-type when present", async () => {
		const stub = stubFetch([{ status: 200, body: {} }]);
		const client = createNetlifyRestClient({ token: "t", fetch: stub.fetch });
		await client.request<unknown>("/resource", { method: "POST", body: { name: "demo" } });
		expect(stub.calls[0]?.method).toBe("POST");
		expect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
		expect(stub.calls[0]?.body).toEqual({ name: "demo" });
	});

	it("returns undefined on 204", async () => {
		const stub = stubFetch([{ status: 204 }]);
		const client = createNetlifyRestClient({ token: "t", fetch: stub.fetch });
		expect(await client.request<unknown>("/whatever")).toBeUndefined();
	});

	it("throws ProviderApiError with the HTTP status on non-2xx", async () => {
		const stub = stubFetch([{ status: 401, body: { messages: ["invalid"] } }]);
		const client = createNetlifyRestClient({ token: "bad", fetch: stub.fetch });
		const err = await client.request<unknown>("/me").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
	});

	it("wraps transport-level failures with status 0", async () => {
		const throwing: typeof fetch = async () => {
			throw new TypeError("fetch failed");
		};
		const client = createNetlifyRestClient({ token: "t", fetch: throwing });
		const err = await client.request<unknown>("/me").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
	});

	it("trims trailing slashes from the base URL", () => {
		const client = createNetlifyRestClient({ token: "t", baseUrl: "https://api.netlify.com/api/v1//" });
		expect(client.baseUrl).toBe("https://api.netlify.com/api/v1");
	});

	describe("uploadZipDeploy", () => {
		it("posts the raw zip bytes with content-type application/zip", async () => {
			const stub = stubFetch([
				{
					status: 200,
					body: {
						id: "d1",
						site_id: "s1",
						state: "uploaded",
						url: "u",
						ssl_url: "su",
						deploy_url: "du",
						branch: null,
						created_at: "t",
					},
				},
			]);
			const client = createNetlifyRestClient({ token: "t", fetch: stub.fetch });
			const zip = new Uint8Array([1, 2, 3]);
			const deploy = await client.uploadZipDeploy("s1", zip);
			expect(deploy.id).toBe("d1");
			expect(stub.calls[0]?.method).toBe("POST");
			expect(stub.calls[0]?.url).toBe("https://api.netlify.com/api/v1/sites/s1/deploys");
			expect(stub.calls[0]?.headers["content-type"]).toBe("application/zip");
			expect(stub.calls[0]?.headers["authorization"]).toBe("Bearer t");
		});

		it("appends ?draft=true when requested", async () => {
			const stub = stubFetch([
				{
					status: 200,
					body: {
						id: "d1",
						site_id: "s1",
						state: "uploaded",
						url: "u",
						ssl_url: "su",
						deploy_url: "du",
						branch: null,
						created_at: "t",
					},
				},
			]);
			const client = createNetlifyRestClient({ token: "t", fetch: stub.fetch });
			await client.uploadZipDeploy("s1", new Uint8Array(), { draft: true });
			expect(stub.calls[0]?.url).toContain("draft=true");
		});

		it("throws ProviderApiError on non-2xx", async () => {
			const stub = stubFetch([{ status: 403, body: { message: "forbidden" } }]);
			const client = createNetlifyRestClient({ token: "t", fetch: stub.fetch });
			const err = await client.uploadZipDeploy("s1", new Uint8Array()).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(403);
		});

		it("wraps transport-level failures with status 0", async () => {
			const throwing: typeof fetch = async () => {
				throw new TypeError("network down");
			};
			const client = createNetlifyRestClient({ token: "t", fetch: throwing });
			const err = await client.uploadZipDeploy("s1", new Uint8Array()).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(0);
		});
	});
});
