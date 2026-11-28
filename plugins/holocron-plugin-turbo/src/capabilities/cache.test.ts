import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createTurboClient } from "../rest.js";
import { NO_TEAM, TurboCache } from "./cache.js";

type Response = Parameters<typeof stubFetch>[0][number];

async function check(response: Response, team: string | null = "acme") {
	const { fetch, calls } = stubFetch([response]);
	const client = createTurboClient({ token: "v-tok", fetch });
	const result = await new TurboCache(
		() => client,
		() => team ?? undefined
	).checkToken();
	return { result, calls };
}

describe("TurboCache.checkToken", () => {
	it("is ok for an enabled cache, reading the team's status with the token", async () => {
		const { result, calls } = await check({ body: { status: "enabled" } });
		expect(result).toEqual({ ok: true, status: "enabled" });
		expect(calls[0]?.url).toContain("/v8/artifacts/status?slug=acme");
		expect(calls[0]?.headers.authorization).toBe("Bearer v-tok");
	});

	it("is ok but says so for a token that can read and not upload", async () => {
		const { result } = await check({ body: { status: "enabled", readOnly: true } });
		expect(result).toMatchObject({ ok: true, readOnly: true });
		expect(result.reason).toMatch(/not upload/);
	});

	it.each(["disabled", "over_limit", "paused"])("is not ok when Remote Caching is %s", async (status) => {
		const { result } = await check({ body: { status } });
		expect(result).toMatchObject({ ok: false, problem: "cache", status });
		expect(result.reason).toContain(status);
	});

	it("reports a state it does not know without calling it ok", async () => {
		const { result } = await check({ body: { status: "sleeping" } });
		expect(result).toMatchObject({ ok: false, status: "sleeping" });
	});

	it("blames the token for a 401", async () => {
		const { result } = await check({ status: 401, body: { error: { code: "forbidden" } } });
		expect(result).toMatchObject({ ok: false, problem: "token" });
	});

	it("blames the team access for a 403 and a 404", async () => {
		expect((await check({ status: 403, body: {} })).result).toMatchObject({ ok: false, problem: "team" });
		const notFound = (await check({ status: 404, body: {} })).result;
		expect(notFound).toMatchObject({ ok: false, problem: "team" });
		expect(notFound.reason).toMatch(/404/);
	});

	it("blames the cache for a 402 and a 410", async () => {
		expect((await check({ status: 402, body: {} })).result).toMatchObject({ ok: false, problem: "cache" });
		expect((await check({ status: 410, body: {} })).result).toMatchObject({ ok: false, problem: "cache" });
	});

	it("throws for an error that says nothing about the token", async () => {
		await expect(check({ status: 500, body: {} })).rejects.toThrow();
	});

	it("fails naming HOLOCRON_TURBO_TEAM, and makes no request, when no team is set", async () => {
		const { result, calls } = await check({ body: {} }, null);
		expect(result).toEqual({ ok: false, problem: "team", reason: NO_TEAM });
		expect(NO_TEAM).toContain("HOLOCRON_TURBO_TEAM");
		expect(calls).toHaveLength(0);
	});
});
