import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { AuthError } from "../auth.js";
import { createCodecovClient } from "../rest.js";
import { CodecovCoverage } from "./coverage.js";

const target = { service: "github", owner: "theholocron", repo: "holocron" } as const;

function build(responses: Parameters<typeof stubFetch>[0], over: { target?: typeof target | null } = {}) {
	const { fetch, calls } = stubFetch(responses);
	const client = createCodecovClient({ token: "cc-tok", baseUrl: "https://codecov.test/api/v2", fetch });
	const cap = new CodecovCoverage(() => client, over.target === null ? undefined : target);
	return { cap, calls };
}

describe("CodecovCoverage", () => {
	it("has the coverage key and the codecov provider name", () => {
		const { cap } = build([]);
		expect(cap.key).toBe("coverage");
		expect(cap.providerName).toBe("codecov");
	});

	it("is accepted when Codecov answers for the repository, and says whether it is private", async () => {
		const { cap, calls } = build([{ body: { name: "holocron", private: true } }]);
		await expect(cap.checkToken()).resolves.toEqual({ outcome: "accepted", repoPrivate: true });
		expect(calls[0]?.url).toBe("https://codecov.test/api/v2/github/theholocron/repos/holocron/");
		expect(calls[0]?.headers.authorization).toBe("Bearer cc-tok");
	});

	it("leaves repoPrivate out when Codecov does not say", async () => {
		const { cap } = build([{ body: { name: "holocron" } }]);
		await expect(cap.checkToken()).resolves.toEqual({ outcome: "accepted" });
	});

	it.each([401, 403])("reports a %i as refused, not as an error", async (status) => {
		const { cap } = build([{ status, body: { detail: "no" } }]);
		await expect(cap.checkToken()).resolves.toEqual({ outcome: "refused", status });
	});

	it("reports a 404 as not found", async () => {
		const { cap } = build([{ status: 404, body: {} }]);
		await expect(cap.checkToken()).resolves.toEqual({ outcome: "not-found", status: 404 });
	});

	it("throws for an error that says nothing about the token", async () => {
		const { cap } = build([{ status: 500, body: { detail: "boom" } }]);
		const err = await cap.checkToken().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/theholocron\/holocron/);
		expect((err as Error).message).not.toContain("cc-tok");
	});

	it("wraps an error that is not an API error, without the token", async () => {
		const failing = { repos: { get: () => Promise.reject(new TypeError("offline")) } };
		const cap = new CodecovCoverage(() => failing as never, target);
		const err = await cap.checkToken().catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/theholocron\/holocron.*offline/);
		expect((err as Error).cause).toBeInstanceOf(TypeError);
	});

	it("throws when the options name no repository", async () => {
		const { cap } = build([], { target: null });
		await expect(cap.checkToken()).rejects.toThrow(/needs a repository/);
	});
});

describe("CodecovCoverage.checkRepo", () => {
	const expected = { flags: ["a", "b"], components: ["a", "b"] };

	function buildRepo(responses: Parameters<typeof stubFetch>[0], over: { target?: null } = {}) {
		const { fetch, calls } = stubFetch(responses);
		const api = createCodecovClient({ token: "api-tok", baseUrl: "https://codecov.test/api/v2", fetch });
		const upload = createCodecovClient({ token: "up-tok", baseUrl: "https://codecov.test/api/v2", fetch });
		const cap = new CodecovCoverage(
			() => upload,
			over.target === null ? undefined : target,
			() => api
		);
		return { cap, calls };
	}

	it("reports names missing from and extra on Codecov, reading both lists with the API token", async () => {
		const { cap, calls } = buildRepo([
			{ body: { next: null, results: [{ flag_name: "a" }, { flag_name: "old" }] } },
			{ body: [{ component_id: "b", name: "b" }] },
		]);
		await expect(cap.checkRepo(expected)).resolves.toEqual({
			checked: true,
			flags: { expected: ["a", "b"], missing: ["b"], extra: ["old"] },
			components: { expected: ["a", "b"], missing: ["a"], extra: [] },
		});
		expect(calls.map((c) => c.url).sort()).toEqual([
			"https://codecov.test/api/v2/github/theholocron/repos/holocron/components/",
			"https://codecov.test/api/v2/github/theholocron/repos/holocron/flags/?page=1&page_size=100",
		]);
		expect(calls.every((c) => c.headers.authorization === "Bearer api-tok")).toBe(true);
	});

	it("is not checked, and names the variable, when there is no API token", async () => {
		const noToken = () => {
			throw new AuthError("none");
		};
		const { fetch, calls } = stubFetch([]);
		const client = createCodecovClient({ token: "up", fetch });
		const cap = new CodecovCoverage(() => client, target, noToken);
		const found = await cap.checkRepo(expected);
		expect(found.checked).toBe(false);
		expect(found.reason).toContain("HOLOCRON_CODECOV_API_TOKEN");
		expect(found.flags).toEqual({ expected: ["a", "b"], missing: [], extra: [] });
		expect(calls).toHaveLength(0);
	});

	it("is not checked when the plugin was built with no API client", async () => {
		const { cap } = build([]);
		await expect(cap.checkRepo(expected)).resolves.toMatchObject({ checked: false });
	});

	it("rethrows an error from resolving the API token that is not an AuthError", async () => {
		const { fetch } = stubFetch([]);
		const client = createCodecovClient({ token: "up", fetch });
		const cap = new CodecovCoverage(
			() => client,
			target,
			() => {
				throw new RangeError("keyring broke");
			}
		);
		await expect(cap.checkRepo(expected)).rejects.toThrow(RangeError);
	});

	it.each([401, 403])("is not checked, saying so, when Codecov answers %i", async (status) => {
		const { cap } = buildRepo([
			{ status, body: {} },
			{ status, body: {} },
		]);
		const found = await cap.checkRepo(expected);
		expect(found.checked).toBe(false);
		expect(found.reason).toContain(String(status));
	});

	it("is not checked when Codecov has no such repository", async () => {
		const { cap } = buildRepo([
			{ status: 404, body: {} },
			{ status: 404, body: {} },
		]);
		const found = await cap.checkRepo(expected);
		expect(found.checked).toBe(false);
		expect(found.reason).toContain("404");
	});

	it("throws for an error that says nothing about access, without the token", async () => {
		const { cap } = buildRepo([
			{ status: 500, body: {} },
			{ status: 500, body: {} },
		]);
		const err = await cap.checkRepo(expected).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/theholocron\/holocron/);
		expect((err as Error).message).not.toContain("api-tok");
	});

	it("wraps an error that is not an API error, without the token", async () => {
		const failing = {
			flags: { list: () => Promise.reject(new TypeError("offline")) },
			components: { list: async () => [] },
		};
		const cap = new CodecovCoverage(
			() => ({}) as never,
			target,
			() => failing as never
		);
		const err = await cap.checkRepo(expected).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/theholocron\/holocron.*offline/);
		expect((err as Error).cause).toBeInstanceOf(TypeError);
	});

	it("throws when the options name no repository", async () => {
		const { cap } = buildRepo([], { target: null });
		await expect(cap.checkRepo(expected)).rejects.toThrow(/needs a repository/);
	});
});
