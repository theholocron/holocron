import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { stubFetch } from "../test-helpers.js";
import { getApp, listAppInstallations } from "./app-info.js";

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
					{ id: 2 },
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
			},
			{ id: 2, account: null, permissions: {}, events: [] },
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
