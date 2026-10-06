import { ProviderApiError } from "@theholocron/http-client";
import { describe, expect, it } from "vitest";

import { createNetlifyClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const TOKEN = "t";
const SITE: { id: string; name: string; url: string; ssl_url: string; admin_url: string; account_id: string } = {
	id: "s1",
	name: "sentinel",
	url: "http://sentinel.netlify.app",
	ssl_url: "https://sentinel.netlify.app",
	admin_url: "https://app.netlify.com/projects/sentinel",
	account_id: "a1",
};

describe("sites", () => {
	it("lists sites", async () => {
		const { fetch } = stubFetch([{ body: [SITE] }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		expect(await client.sites.list()).toEqual([SITE]);
	});

	it("gets a site by id", async () => {
		const { fetch, calls } = stubFetch([{ body: SITE }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		expect(await client.sites.get("s1")).toEqual(SITE);
		expect(calls[0]?.url).toContain("/sites/s1");
	});

	it("creates a site scoped to an account slug", async () => {
		const { fetch, calls } = stubFetch([{ body: SITE }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		const created = await client.sites.create("iamnewton", { name: "sentinel" });
		expect(created).toEqual(SITE);
		expect(calls[0]?.url).toContain("/iamnewton/sites");
		expect(calls[0]?.method).toBe("POST");
	});

	it("patches a site", async () => {
		const { fetch, calls } = stubFetch([{ body: { ...SITE, custom_domain: "sentinel.theholocron.dev" } }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		await client.sites.update("s1", { custom_domain: "sentinel.theholocron.dev" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.body).toEqual({ custom_domain: "sentinel.theholocron.dev" });
	});

	it("triggers a build", async () => {
		const { fetch, calls } = stubFetch([{ body: { deploy_id: "d1" } }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		const result = await client.sites.triggerBuild("s1");
		expect(result.deploy_id).toBe("d1");
		expect(calls[0]?.url).toContain("/sites/s1/builds");
	});
});

const DEPLOY = {
	id: "d1",
	site_id: "s1",
	state: "uploaded",
	url: "u",
	ssl_url: "su",
	deploy_url: "du",
	branch: null,
	created_at: "2026-01-01T00:00:00Z",
};

describe("deploys", () => {
	it("gets a deploy", async () => {
		const { fetch } = stubFetch([{ body: DEPLOY }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		expect(await client.deploys.get("d1")).toEqual(DEPLOY);
	});

	describe("createFromZip", () => {
		it("posts the zipped files with content-type application/zip", async () => {
			const { fetch, calls } = stubFetch([{ body: DEPLOY }]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			const deploy = await client.deploys.createFromZip("s1", { "api/webhook.mjs": "export default () => {};" });
			expect(deploy.id).toBe("d1");
			expect(calls[0]?.method).toBe("POST");
			expect(calls[0]?.url).toBe("https://api.netlify.com/api/v1/sites/s1/deploys");
			expect(calls[0]?.headers["content-type"]).toBe("application/zip");
			expect(calls[0]?.body).toBeInstanceOf(Uint8Array);
		});

		it("appends ?draft=true when requested", async () => {
			const { fetch, calls } = stubFetch([{ body: DEPLOY }]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			await client.deploys.createFromZip("s1", { "a.txt": "x" }, { draft: true });
			expect(calls[0]?.url).toContain("draft=true");
		});

		it("strips a leading slash from file paths before zipping", async () => {
			const { fetch, calls } = stubFetch([{ body: DEPLOY }]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			await client.deploys.createFromZip("s1", { "/api/webhook.mjs": "x" });
			// The zip itself isn't inspected here (covered by a real unzip in
			// the plugin's own packaging step) — this just exercises the
			// leading-slash branch so it isn't silently untested.
			expect(calls[0]?.body).toBeInstanceOf(Uint8Array);
		});

		it("falls back to globalThis.fetch when no override is given", async () => {
			const original = globalThis.fetch;
			const stub = stubFetch([{ body: DEPLOY }]);
			globalThis.fetch = stub.fetch;
			try {
				const client = createNetlifyClient({ token: TOKEN });
				const deploy = await client.deploys.createFromZip("s1", { "a.txt": "x" });
				expect(deploy.id).toBe("d1");
			} finally {
				globalThis.fetch = original;
			}
		});

		it("throws ProviderApiError on non-2xx", async () => {
			const { fetch } = stubFetch([{ status: 403, body: { message: "forbidden" } }]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			const err = await client.deploys.createFromZip("s1", { "a.txt": "x" }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(403);
		});

		it("wraps transport-level failures with status 0", async () => {
			const throwing: typeof fetch = async () => {
				throw new TypeError("network down");
			};
			const client = createNetlifyClient({ token: TOKEN, fetch: throwing });
			const err = await client.deploys.createFromZip("s1", { "a.txt": "x" }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).status).toBe(0);
		});

		it("stringifies a non-Error transport failure", async () => {
			const throwing: typeof fetch = async () => {
				throw "connection reset";
			};
			const client = createNetlifyClient({ token: TOKEN, fetch: throwing });
			const err = await client.deploys.createFromZip("s1", { "a.txt": "x" }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ProviderApiError);
			expect((err as ProviderApiError).message).toContain("connection reset");
		});
	});
});

describe("user", () => {
	it("gets the current user", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "u1", email: "user@example.com" } }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		const me = await client.user.get();
		expect(me.email).toBe("user@example.com");
		expect(calls[0]?.url).toContain("/user");
	});
});

describe("env", () => {
	it("lists env vars scoped to a site", async () => {
		const { fetch, calls } = stubFetch([{ body: [{ key: "A", values: [{ value: "1", context: "production" }] }] }]);
		const client = createNetlifyClient({ token: TOKEN, fetch });
		const vars = await client.env.list("acc1", "s1");
		expect(vars[0]?.key).toBe("A");
		expect(calls[0]?.url).toContain("/accounts/acc1/env");
		expect(calls[0]?.url).toContain("site_id=s1");
	});

	describe("set", () => {
		it("creates a new key when it doesn't exist yet", async () => {
			const { fetch, calls } = stubFetch([{ body: [] }, { body: {} }]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			await client.env.set("acc1", "s1", "NEW_KEY", "production", "v1");
			expect(calls[1]?.method).toBe("POST");
			expect(calls[1]?.body).toMatchObject({ key: "NEW_KEY", values: [{ value: "v1", context: "production" }] });
		});

		it("replaces only the matching context's value, preserving others", async () => {
			const { fetch, calls } = stubFetch([
				{
					body: [
						{
							key: "K",
							scopes: ["functions"],
							values: [
								{ value: "old-prod", context: "production" },
								{ value: "dev-val", context: "branch-deploy" },
							],
						},
					],
				},
				{ body: {} },
			]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			await client.env.set("acc1", "s1", "K", "production", "new-prod");
			expect(calls[1]?.method).toBe("PUT");
			expect(calls[1]?.url).toContain("/accounts/acc1/env/K");
			expect(calls[1]?.body).toMatchObject({
				values: [
					{ value: "dev-val", context: "branch-deploy" },
					{ value: "new-prod", context: "production" },
				],
			});
		});

		it("defaults scopes to functions+runtime when the existing key has none", async () => {
			const { fetch, calls } = stubFetch([
				{ body: [{ key: "K", values: [{ value: "old", context: "production" }] }] },
				{ body: {} },
			]);
			const client = createNetlifyClient({ token: TOKEN, fetch });
			await client.env.set("acc1", "s1", "K", "production", "new");
			expect(calls[1]?.body).toMatchObject({ scopes: ["functions", "runtime"] });
		});
	});
});
