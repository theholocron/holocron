import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

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

	it("throws when the options name no repository", async () => {
		const { cap } = build([], { target: null });
		await expect(cap.checkToken()).rejects.toThrow(/needs a repository/);
	});
});
