import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createAppJWT, createInstallationClient, getInstallationAccessToken } from "../app-auth/app-auth.js";
import { REPO, stubFetch } from "./helpers.js";

const { privateKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs1", format: "pem" },
});
const CREDS = { appId: "123456", privateKey };
const BASE = "https://gh.test";
const INSTALLATION_ID = 987;

function decodeJwt(jwt: string) {
	const [headerB64, payloadB64, sigB64] = jwt.split(".");
	return {
		header: JSON.parse(Buffer.from(headerB64!, "base64url").toString()) as { alg: string; typ: string },
		payload: JSON.parse(Buffer.from(payloadB64!, "base64url").toString()) as {
			iat: number;
			exp: number;
			iss: string;
		},
		signingInput: `${headerB64}.${payloadB64}`,
		signature: Buffer.from(sigB64!, "base64url"),
	};
}

describe("createAppJWT", () => {
	it("produces a well-formed RS256 JWT with the App id as issuer", async () => {
		const jwt = await createAppJWT(CREDS, Date.parse("2026-01-01T00:00:00Z"));
		const { header, payload } = decodeJwt(jwt);

		expect(header).toEqual({ alg: "RS256", typ: "JWT" });
		expect(payload.iss).toBe("123456");
		expect(payload.exp - payload.iat).toBe(600);
	});

	it("backdates iat by 60s to absorb clock drift, per GitHub's own recommendation", async () => {
		const now = Date.parse("2026-01-01T00:00:00Z");
		const jwt = await createAppJWT(CREDS, now);
		const { payload } = decodeJwt(jwt);
		expect(payload.iat).toBe(Math.floor(now / 1000) - 60);
	});

	it("produces a signature that verifies against the credential's public half", async () => {
		const jwt = await createAppJWT(CREDS);
		const { signingInput, signature } = decodeJwt(jwt);
		const publicKey = createPublicKey(privateKey);
		const isValid = verify("sha256", Buffer.from(signingInput), publicKey, signature);
		expect(isValid).toBe(true);
	});
});

describe("getInstallationAccessToken", () => {
	it("POSTs to /app/installations/{id}/access_tokens with a Bearer App JWT", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { token: "ghs_installation_token", expires_at: "2026-01-01T01:00:00Z" } },
		]);

		const result = await getInstallationAccessToken(CREDS, INSTALLATION_ID, { baseUrl: BASE, fetch });

		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/app/installations/${INSTALLATION_ID}/access_tokens`);
		const authHeader = calls[0]?.headers.authorization;
		expect(authHeader).toMatch(/^Bearer /);
		const { payload } = decodeJwt(authHeader!.slice("Bearer ".length));
		expect(payload.iss).toBe("123456");
		expect(result).toEqual({ token: "ghs_installation_token", expiresAt: "2026-01-01T01:00:00Z" });
	});

	it("throws ProviderApiError on a non-ok response", async () => {
		const { fetch } = stubFetch([{ status: 404, text: "Not Found" }]);
		const err = await getInstallationAccessToken(CREDS, INSTALLATION_ID, { baseUrl: BASE, fetch }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/access_tokens.*404/);
	});

	it("falls back to an empty body when a non-ok response's own .text() rejects", async () => {
		const brokenFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			text: () => Promise.reject(new Error("stream already consumed")),
		});
		const err = await getInstallationAccessToken(CREDS, INSTALLATION_ID, {
			baseUrl: BASE,
			fetch: brokenFetch as unknown as typeof fetch,
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/access_tokens.*500/);
	});

	it("defaults to https://api.github.com and globalThis.fetch when no overrides are given", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ token: "ghs_x", expires_at: "2026-01-01T01:00:00Z" }), { status: 201 })
			);
		vi.stubGlobal("fetch", mockFetch);
		try {
			await getInstallationAccessToken(CREDS, INSTALLATION_ID);
			expect(mockFetch).toHaveBeenCalledWith(
				`https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
				expect.anything()
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("createInstallationClient", () => {
	it("exchanges for an installation token, then returns a GitHubClient authenticated with it", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 201, body: { token: "ghs_installation_token", expires_at: "2026-01-01T01:00:00Z" } },
			{ status: 200, body: { name: "test-repo", full_name: REPO } },
		]);

		const client = await createInstallationClient(CREDS, INSTALLATION_ID, { baseUrl: BASE, fetch });
		await client.repos.getRepo(REPO);

		expect(calls[0]?.url).toBe(`${BASE}/app/installations/${INSTALLATION_ID}/access_tokens`);
		expect(calls[1]?.headers.authorization).toBe("Bearer ghs_installation_token");
	});
});
