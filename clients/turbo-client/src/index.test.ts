import { ProviderApiError } from "@theholocron/http-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createTurboClient, teamQuery } from "./index.js";

const TOKEN = "turbo-test-token";

describe("createTurboClient", () => {
	it("sends the Bearer token to Vercel's API", async () => {
		const { fetch, calls } = stubFetch([{ body: { status: "enabled" } }]);
		await createTurboClient({ token: TOKEN, fetch }).cache.status("acme");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.url).toContain("https://api.vercel.com/v8/artifacts/status");
	});

	it("respects the baseUrl override", async () => {
		const { fetch, calls } = stubFetch([{ body: { status: "enabled" } }]);
		await createTurboClient({ token: TOKEN, baseUrl: "https://turbo.test.invalid", fetch }).cache.status("acme");
		expect(calls[0]?.url).toContain("https://turbo.test.invalid");
	});
});

describe("cache.status", () => {
	it("GETs the status by team slug", async () => {
		const { fetch, calls } = stubFetch([{ body: { status: "enabled", readOnly: true } }]);
		const result = await createTurboClient({ token: TOKEN, fetch }).cache.status("acme");
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("slug=acme");
		expect(calls[0]?.url).not.toContain("teamId");
		expect(result).toEqual({ status: "enabled", readOnly: true });
	});

	it("sends a team id as teamId", async () => {
		const { fetch, calls } = stubFetch([{ body: { status: "enabled" } }]);
		await createTurboClient({ token: TOKEN, fetch }).cache.status("team_abc");
		expect(calls[0]?.url).toContain("teamId=team_abc");
	});

	it("rejects with a ProviderApiError carrying the status", async () => {
		const { fetch } = stubFetch([{ status: 403, body: { error: { code: "forbidden" } } }]);
		const err = await createTurboClient({ token: TOKEN, fetch })
			.cache.status("acme")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(403);
	});
});

describe("teamQuery", () => {
	it("tells a slug from a team id", () => {
		expect(teamQuery("acme")).toEqual({ slug: "acme" });
		expect(teamQuery("team_1")).toEqual({ teamId: "team_1" });
	});
});
