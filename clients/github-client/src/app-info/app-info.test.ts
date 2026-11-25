import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { stubFetch } from "../test-helpers.js";
import {
	getApp,
	getRepoInstallation,
	listAppDeliveries,
	listAppInstallations,
	redeliverAppDelivery,
	suspendAppInstallation,
	unsuspendAppInstallation,
} from "./app-info.js";

const { privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
});
const CREDS = { appId: "123456", privateKey };
const BASE = "https://gh.test";

describe("getApp", () => {
	it("GETs /app with a Bearer App JWT and returns the slug, owner, permissions and events", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: {
					slug: "sentinel",
					name: "Sentinel",
					owner: { login: "theholocron", type: "Organization" },
					permissions: { checks: "write" },
					events: ["push"],
				},
			},
		]);
		const app = await getApp(CREDS, { baseUrl: BASE, fetch });
		expect(calls[0]?.url).toBe(`${BASE}/app`);
		expect(calls[0]?.headers.authorization).toMatch(/^Bearer /);
		expect(app).toEqual({
			slug: "sentinel",
			name: "Sentinel",
			owner: { login: "theholocron", type: "Organization" },
			permissions: { checks: "write" },
			events: ["push"],
		});
	});

	it("defaults missing lists and an owner without a login", async () => {
		const { fetch } = stubFetch([{ body: { slug: "s", name: "S", owner: { type: "User" } } }]);
		expect(await getApp(CREDS, { baseUrl: BASE, fetch })).toEqual({
			slug: "s",
			name: "S",
			owner: null,
			permissions: {},
			events: [],
		});
	});

	it("keeps an owner whose type is missing", async () => {
		const { fetch } = stubFetch([{ body: { slug: "s", name: "S", owner: { login: "me" } } }]);
		expect((await getApp(CREDS, { baseUrl: BASE, fetch })).owner).toEqual({ login: "me", type: "" });
	});

	it("throws a ProviderApiError carrying the status on a 401", async () => {
		const { fetch } = stubFetch([{ status: 401, text: "Bad credentials" }]);
		const err = await getApp(CREDS, { baseUrl: BASE, fetch }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/\/app.*401/);
		expect((err as { status: number }).status).toBe(401);
	});

	it("falls back to an empty body when a failed response's .text() rejects", async () => {
		const fetch = (() =>
			Promise.resolve({
				ok: false,
				status: 500,
				text: () => Promise.reject(new Error("x")),
			})) as unknown as typeof globalThis.fetch;
		const err = await getApp(CREDS, { baseUrl: BASE, fetch }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/500/);
	});

	it("defaults to api.github.com and globalThis.fetch", async () => {
		const original = globalThis.fetch;
		let url = "";
		globalThis.fetch = ((u: string) => {
			url = u;
			return Promise.resolve(new Response(JSON.stringify({ slug: "s", name: "S" })));
		}) as never;
		try {
			await getApp(CREDS);
		} finally {
			globalThis.fetch = original;
		}
		expect(url).toBe("https://api.github.com/app");
	});
});

describe("suspendAppInstallation and unsuspendAppInstallation", () => {
	it("PUT and DELETE /app/installations/{id}/suspended with the App JWT", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }, { status: 204 }]);
		await suspendAppInstallation(CREDS, 42, { baseUrl: BASE, fetch });
		await unsuspendAppInstallation(CREDS, 42, { baseUrl: BASE, fetch });
		expect(calls.map((c) => [c.method, c.url])).toEqual([
			["PUT", `${BASE}/app/installations/42/suspended`],
			["DELETE", `${BASE}/app/installations/42/suspended`],
		]);
		expect(calls[0]?.headers.authorization).toMatch(/^Bearer /);
	});

	it("throws a ProviderApiError carrying the status when GitHub refuses", async () => {
		const { fetch } = stubFetch([{ status: 404, text: "Not Found" }]);
		const err = await suspendAppInstallation(CREDS, 7, { baseUrl: BASE, fetch }).catch((e: unknown) => e);
		expect((err as { status: number }).status).toBe(404);
	});
});

describe("listAppInstallations", () => {
	it("returns each installation with its account, permissions and events", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: [
					{
						id: 1,
						account: { login: "theholocron", type: "Organization" },
						permissions: { a: "read" },
						events: ["push"],
					},
					{ id: 2, suspended_at: "2026-11-23T10:00:00Z" },
				],
			},
		]);
		const result = await listAppInstallations(CREDS, { baseUrl: BASE, fetch });
		expect(calls[0]?.url).toBe(`${BASE}/app/installations?per_page=100&page=1`);
		expect(result).toEqual([
			{
				id: 1,
				account: { login: "theholocron", type: "Organization" },
				permissions: { a: "read" },
				events: ["push"],
				suspended: false,
			},
			{ id: 2, account: null, permissions: {}, events: [], suspended: true },
		]);
	});

	it("reads the next page while a page is full", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ id: i }));
		const { fetch, calls } = stubFetch([{ body: full }, { body: [{ id: 100 }] }]);
		const result = await listAppInstallations(CREDS, { baseUrl: BASE, fetch });
		expect(result).toHaveLength(101);
		expect(calls[1]?.url).toBe(`${BASE}/app/installations?per_page=100&page=2`);
	});
});

const delivery = (id: number, at: string, over: Record<string, unknown> = {}) => ({
	id,
	guid: `guid-${id}`,
	delivered_at: at,
	redelivery: false,
	status_code: 200,
	status: "OK",
	event: "check_run",
	action: "completed",
	installation_id: 7,
	...over,
});

describe("listAppDeliveries", () => {
	it("GETs /app/hook/deliveries with a Bearer App JWT and returns each delivery in the plain shape", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: [
					delivery(1, "2026-11-22T10:00:00Z"),
					delivery(2, "2026-11-22T09:00:00Z", {
						redelivery: true,
						status_code: 500,
						status: "Invalid HTTP Response: 500",
						action: null,
						installation_id: null,
					}),
				],
			},
		]);
		const result = await listAppDeliveries(CREDS, { baseUrl: BASE, fetch });
		expect(calls[0]?.url).toBe(`${BASE}/app/hook/deliveries?per_page=100`);
		expect(calls[0]?.headers.authorization).toMatch(/^Bearer /);
		expect(result).toEqual([
			{
				id: 1,
				guid: "guid-1",
				deliveredAt: "2026-11-22T10:00:00Z",
				redelivery: false,
				statusCode: 200,
				status: "OK",
				event: "check_run",
				action: "completed",
				installationId: 7,
			},
			{
				id: 2,
				guid: "guid-2",
				deliveredAt: "2026-11-22T09:00:00Z",
				redelivery: true,
				statusCode: 500,
				status: "Invalid HTTP Response: 500",
				event: "check_run",
				action: null,
				installationId: null,
			},
		]);
	});

	it("defaults the fields GitHub leaves out", async () => {
		const { fetch } = stubFetch([
			{ body: [{ id: 3, guid: "g", delivered_at: "2026-11-22T10:00:00Z", event: "ping" }] },
		]);
		expect(await listAppDeliveries(CREDS, { baseUrl: BASE, fetch })).toEqual([
			{
				id: 3,
				guid: "g",
				deliveredAt: "2026-11-22T10:00:00Z",
				redelivery: false,
				statusCode: 0,
				status: "",
				event: "ping",
				action: null,
				installationId: null,
			},
		]);
	});

	it("follows the cursor of the next link until the last page", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: [delivery(1, "2026-11-22T10:00:00Z")],
				headers: {
					link: `<${BASE}/app/hook/deliveries?per_page=100&cursor=abc>; rel="next", <${BASE}/x>; rel="first"`,
				},
			},
			{ body: [delivery(2, "2026-11-22T09:00:00Z")] },
		]);
		const result = await listAppDeliveries(CREDS, { baseUrl: BASE, fetch });
		expect(result.map((d) => d.id)).toEqual([1, 2]);
		expect(calls[1]?.url).toBe(`${BASE}/app/hook/deliveries?per_page=100&cursor=abc`);
	});

	it("stops reading at a delivery older than since, and leaves the older ones out", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: [delivery(1, "2026-11-22T10:00:00Z"), delivery(2, "2026-11-21T10:00:00Z")],
				headers: { link: `<${BASE}/a?cursor=abc>; rel="next"` },
			},
		]);
		const result = await listAppDeliveries(CREDS, { baseUrl: BASE, fetch, since: "2026-11-22T00:00:00Z" });
		expect(result.map((d) => d.id)).toEqual([1]);
		expect(calls).toHaveLength(1);
	});

	it("keeps reading while the page is still newer than since, and stops at maxPages", async () => {
		const link = { link: `<${BASE}/a?cursor=abc>; rel="next"` };
		const { fetch, calls } = stubFetch([
			{ body: [delivery(1, "2026-11-22T10:00:00Z")], headers: link },
			{ body: [delivery(2, "2026-11-22T09:00:00Z")], headers: link },
			{ body: [delivery(3, "2026-11-22T08:00:00Z")], headers: link },
		]);
		expect(
			(await listAppDeliveries(CREDS, { baseUrl: BASE, fetch, since: "2026-11-22T00:00:00Z", maxPages: 2 })).map(
				(d) => d.id
			)
		).toEqual([1, 2]);
		expect(calls).toHaveLength(2);
	});

	it("reads a page with no deliveries, and a link with no next cursor, as the end", async () => {
		const { fetch } = stubFetch([{ body: [], headers: { link: `<${BASE}/a>; rel="prev"` } }]);
		expect(await listAppDeliveries(CREDS, { baseUrl: BASE, fetch, since: "2026-11-22T00:00:00Z" })).toEqual([]);
	});

	it("throws a ProviderApiError carrying the status", async () => {
		const { fetch } = stubFetch([{ status: 401, text: "Bad credentials" }]);
		const err = await listAppDeliveries(CREDS, { baseUrl: BASE, fetch }).catch((e: unknown) => e);
		expect((err as { status: number }).status).toBe(401);
		expect((err as Error).message).toMatch(/GET \/app\/hook\/deliveries.*401/);
	});
});

describe("redeliverAppDelivery", () => {
	it("POSTs /app/hook/deliveries/{id}/attempts with the App's JWT", async () => {
		const { fetch, calls } = stubFetch([{ status: 202, body: {} }]);
		await redeliverAppDelivery(CREDS, 42, { baseUrl: BASE, fetch });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/app/hook/deliveries/42/attempts`);
		expect(calls[0]?.headers.authorization).toMatch(/^Bearer /);
	});

	it("throws a ProviderApiError naming the POST when GitHub refuses", async () => {
		const { fetch } = stubFetch([{ status: 422, text: "too old" }]);
		const err = await redeliverAppDelivery(CREDS, 42, { baseUrl: BASE, fetch }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/POST \/app\/hook\/deliveries\/42\/attempts.*422/);
		expect((err as { status: number }).status).toBe(422);
	});
});

describe("getRepoInstallation", () => {
	it("GETs the repository's installation with the App JWT and maps it", async () => {
		const { fetch, calls } = stubFetch([
			{
				body: {
					id: 42,
					account: { login: "theholocron", type: "Organization" },
					permissions: { actions: "write" },
					events: ["push"],
					suspended_at: "2026-11-23T10:00:00Z",
				},
			},
		]);
		const found = await getRepoInstallation(CREDS, "theholocron/holocron", { baseUrl: BASE, fetch });
		expect(calls[0]?.url).toBe(`${BASE}/repos/theholocron/holocron/installation`);
		expect(calls[0]?.headers.authorization).toMatch(/^Bearer /);
		expect(found).toEqual({
			id: 42,
			account: { login: "theholocron", type: "Organization" },
			permissions: { actions: "write" },
			events: ["push"],
			suspended: true,
		});
	});

	it("defaults the lists and says not suspended", async () => {
		const { fetch } = stubFetch([{ body: { id: 7 } }]);
		expect(await getRepoInstallation(CREDS, "o/r", { baseUrl: BASE, fetch })).toEqual({
			id: 7,
			account: null,
			permissions: {},
			events: [],
			suspended: false,
		});
	});

	it("answers undefined when the App is not installed there, and rethrows any other failure", async () => {
		const missing = stubFetch([{ status: 404, text: "Not Found" }]);
		expect(await getRepoInstallation(CREDS, "o/r", { baseUrl: BASE, fetch: missing.fetch })).toBeUndefined();
		const broken = stubFetch([{ status: 500, text: "boom" }]);
		const err = await getRepoInstallation(CREDS, "o/r", { baseUrl: BASE, fetch: broken.fetch }).catch(
			(e: unknown) => e
		);
		expect((err as { status: number }).status).toBe(500);
	});
});
