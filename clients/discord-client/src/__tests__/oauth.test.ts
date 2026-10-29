import { describe, expect, it, vi } from "vitest";

import {
	createDiscordOAuthClient,
	DEFAULT_STATE_TTL_SECONDS,
	findVerifiedConnection,
	signOAuthState,
	verifyOAuthState,
} from "../index.js";

const BASE = "https://discord.test/api/v10";

/** The shared `stubFetch` parses every string body as JSON; the token calls send a form, so this keeps it raw. */
function makeClient(responses: Array<{ status?: number; body?: unknown }>, extra: { baseUrl?: string } = {}) {
	const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | null }> = [];
	let i = 0;
	const fetch = (async (input: string | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: (init?.method ?? "GET").toUpperCase(),
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: typeof init?.body === "string" ? init.body : null,
		});
		const next = responses[i++] ?? { body: {} };
		return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
	}) as typeof globalThis.fetch;
	return {
		client: createDiscordOAuthClient({
			clientId: "9",
			clientSecret: "shh",
			redirectUri: "https://link.test/cb",
			baseUrl: extra.baseUrl ?? BASE,
			authorizeUrl: "https://discord.test/oauth2/authorize",
			fetch,
		}),
		calls,
	};
}

describe("authorizeUrl", () => {
	it("carries the client, redirect, scopes and state", () => {
		const { client } = makeClient([]);
		const url = new URL(client.authorizeUrl({ state: "abc" }));
		expect(url.origin + url.pathname).toBe("https://discord.test/oauth2/authorize");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: "9",
			response_type: "code",
			redirect_uri: "https://link.test/cb",
			scope: "identify connections",
			state: "abc",
		});
	});

	it("takes narrower scopes and a prompt", () => {
		const { client } = makeClient([]);
		const url = new URL(client.authorizeUrl({ state: "s", scopes: ["identify"], prompt: "none" }));
		expect(url.searchParams.get("scope")).toBe("identify");
		expect(url.searchParams.get("prompt")).toBe("none");
	});

	it("points at discord.com when no override is given", () => {
		const client = createDiscordOAuthClient({ clientId: "9", clientSecret: "x", redirectUri: "https://a.test/cb" });
		expect(client.authorizeUrl({ state: "s" })).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?/);
	});
});

describe("token calls", () => {
	it("exchangeCode posts a form with the client's Basic credentials", async () => {
		const { client, calls } = makeClient([
			{ body: { access_token: "at", token_type: "Bearer", expires_in: 1, scope: "identify" } },
		]);
		expect((await client.exchangeCode("the-code")).access_token).toBe("at");
		expect(calls[0]).toMatchObject({ url: `${BASE}/oauth2/token`, method: "POST" });
		expect(calls[0]?.headers.authorization).toBe(`Basic ${btoa("9:shh")}`);
		expect(calls[0]?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
		expect(new URLSearchParams(calls[0]?.body ?? "").get("grant_type")).toBe("authorization_code");
		expect(new URLSearchParams(calls[0]?.body ?? "").get("code")).toBe("the-code");
		expect(new URLSearchParams(calls[0]?.body ?? "").get("redirect_uri")).toBe("https://link.test/cb");
	});

	it("refresh asks for a refresh_token grant", async () => {
		const { client, calls } = makeClient([
			{ body: { access_token: "n", token_type: "Bearer", expires_in: 1, scope: "" } },
		]);
		await client.refresh("rt");
		expect(new URLSearchParams(calls[0]?.body ?? "").get("grant_type")).toBe("refresh_token");
		expect(new URLSearchParams(calls[0]?.body ?? "").get("refresh_token")).toBe("rt");
	});

	it("revoke posts the token and returns nothing", async () => {
		const { client, calls } = makeClient([{ body: {} }]);
		await expect(client.revoke("at")).resolves.toBeUndefined();
		expect(calls[0]?.url).toBe(`${BASE}/oauth2/token/revoke`);
		expect(new URLSearchParams(calls[0]?.body ?? "").get("token")).toBe("at");
	});

	it("a trailing slash on the base URL is ignored", async () => {
		const { client, calls } = makeClient([{ body: { id: "1", username: "u" } }], { baseUrl: `${BASE}//` });
		await client.user("at");
		expect(calls[0]?.url).toBe(`${BASE}/users/@me`);
	});
});

describe("member calls", () => {
	it("user and connections send the member's Bearer token", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "333", username: "luke" } },
			{ body: [{ id: "55", name: "luke", type: "github", verified: true }] },
		]);
		expect((await client.user("at")).id).toBe("333");
		expect((await client.connections("at"))[0]?.name).toBe("luke");
		expect(calls[0]).toMatchObject({ url: `${BASE}/users/@me`, method: "GET" });
		expect(calls[0]?.headers.authorization).toBe("Bearer at");
		expect(calls[1]?.url).toBe(`${BASE}/users/@me/connections`);
	});

	it("a refused request becomes a ProviderApiError with the status and body", async () => {
		const { client } = makeClient([{ status: 400, body: { error: "invalid_grant" } }]);
		await expect(client.exchangeCode("bad")).rejects.toMatchObject({
			status: 400,
			message: "Discord POST /oauth2/token → 400",
		});
	});

	it("a refusal whose body cannot be read still reports the status", async () => {
		const res = new Response("x", { status: 500 });
		vi.spyOn(res, "text").mockRejectedValue(new Error("boom"));
		const client = createDiscordOAuthClient({
			clientId: "9",
			clientSecret: "x",
			redirectUri: "https://a.test/cb",
			fetch: (() => Promise.resolve(res)) as typeof fetch,
		});
		await expect(client.user("at")).rejects.toMatchObject({ status: 500, details: "" });
	});

	it("a transport failure becomes status 0, naming the cause", async () => {
		const client = createDiscordOAuthClient({
			clientId: "9",
			clientSecret: "x",
			redirectUri: "https://a.test/cb",
			fetch: (() => Promise.reject(new Error("offline"))) as typeof fetch,
		});
		await expect(client.user("at")).rejects.toMatchObject({
			status: 0,
			message: expect.stringContaining("offline"),
		});
	});

	it("a non-Error rejection is still reported", async () => {
		const client = createDiscordOAuthClient({
			clientId: "9",
			clientSecret: "x",
			redirectUri: "https://a.test/cb",
			fetch: (() => Promise.reject("nope")) as typeof fetch,
		});
		await expect(client.user("at")).rejects.toMatchObject({ status: 0, message: expect.stringContaining("nope") });
	});
});

describe("findVerifiedConnection", () => {
	const list = [
		{ id: "1", name: "fake", type: "github", verified: false },
		{ id: "2", name: "real", type: "github", verified: true },
		{ id: "3", name: "t", type: "twitch", verified: true },
	];
	it("returns the verified connection of that service", () => {
		expect(findVerifiedConnection(list, "github")?.id).toBe("2");
	});
	it("ignores unverified ones", () => {
		expect(findVerifiedConnection([list[0]!], "github")).toBeUndefined();
	});
	it("returns undefined when the service is not linked", () => {
		expect(findVerifiedConnection(list, "steam")).toBeUndefined();
	});
});

describe("signed state", () => {
	const now = 1_700_000_000_000;

	it("verifies a state it signed", () => {
		expect(verifyOAuthState("k", signOAuthState("k", { now }), { now })).toBe(true);
	});

	it("uses the default lifetime and the clock when none is given", () => {
		const state = signOAuthState("k");
		expect(verifyOAuthState("k", state)).toBe(true);
		expect(Number(state.split(".")[0]) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(
			DEFAULT_STATE_TTL_SECONDS
		);
	});

	it("is different every time", () => {
		expect(signOAuthState("k", { now })).not.toBe(signOAuthState("k", { now }));
	});

	it("rejects an expired state", () => {
		const state = signOAuthState("k", { now, ttlSeconds: 60 });
		expect(verifyOAuthState("k", state, { now: now + 61_000 })).toBe(false);
		expect(verifyOAuthState("k", state, { now: now + 60_000 })).toBe(true);
	});

	it("rejects another secret, a tampered body and a tampered signature", () => {
		const state = signOAuthState("k", { now });
		const [exp, nonce, sig] = state.split(".") as [string, string, string];
		expect(verifyOAuthState("other", state, { now })).toBe(false);
		expect(verifyOAuthState("k", `${Number(exp) + 1000}.${nonce}.${sig}`, { now })).toBe(false);
		expect(verifyOAuthState("k", `${exp}.${nonce}.${sig.slice(0, -1)}0`, { now })).toBe(sig.endsWith("0"));
		expect(verifyOAuthState("k", `${exp}.${nonce}.${sig.slice(1)}`, { now })).toBe(false);
	});

	it("rejects malformed input without throwing", () => {
		for (const bad of ["", "a.b", "x.y.z", "1.zz.abc", "1.00000000000000000000000000000000.abc.d"]) {
			expect(verifyOAuthState("k", bad, { now })).toBe(false);
		}
	});
});
