import { describe, expect, it } from "vitest";

import { syncLabels, type CanonicalLabel } from "../capabilities/labels.js";
import { createGitHubClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

const CANONICAL: CanonicalLabel[] = [
	{ name: "bug", color: "d73a4a", description: "Something isn't working" },
	{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
	{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
];

const STALE = ["github_actions", "javascript"];

function makeRest(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	return { rest, calls };
}

// ── create ────────────────────────────────────────────────────────────────────

describe("syncLabels — create", () => {
	it("POSTs labels that are missing from the repo", async () => {
		const { rest, calls } = makeRest([
			// GET /labels
			{ status: 200, body: [] },
			// POST bug
			{ status: 201, body: {} },
			// POST enhancement
			{ status: 201, body: {} },
			// POST ci
			{ status: 201, body: {} },
		]);

		const result = await syncLabels(rest, REPO, CANONICAL, []);

		expect(result).toBe("3 created, 0 updated, 0 deleted");
		expect(calls).toHaveLength(4);
		expect(calls[0]).toMatchObject({ method: "GET", url: expect.stringContaining("/labels") });
		expect(calls[1]).toMatchObject({
			method: "POST",
			body: { name: "bug", color: "d73a4a", description: "Something isn't working" },
		});
		expect(calls[2]).toMatchObject({ method: "POST", body: expect.objectContaining({ name: "enhancement" }) });
		expect(calls[3]).toMatchObject({ method: "POST", body: expect.objectContaining({ name: "ci" }) });
	});
});

// ── update ────────────────────────────────────────────────────────────────────

describe("syncLabels — update", () => {
	it("PATCHes a label whose color has drifted", async () => {
		const { rest, calls } = makeRest([
			{
				status: 200,
				body: [
					{ name: "bug", color: "wrong00", description: "Something isn't working" },
					{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
					{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
				],
			},
			// PATCH bug
			{ status: 200, body: {} },
		]);

		const result = await syncLabels(rest, REPO, CANONICAL, []);

		expect(result).toBe("0 created, 1 updated, 0 deleted");
		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({
			method: "PATCH",
			url: expect.stringContaining("/labels/bug"),
			body: { color: "d73a4a", description: "Something isn't working" },
		});
	});

	it("PATCHes a label whose description has drifted", async () => {
		const { rest, calls } = makeRest([
			{
				status: 200,
				body: [
					{ name: "bug", color: "d73a4a", description: "old description" },
					{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
					{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
				],
			},
			{ status: 200, body: {} },
		]);

		const result = await syncLabels(rest, REPO, CANONICAL, []);

		expect(result).toBe("0 created, 1 updated, 0 deleted");
		expect(calls[1]).toMatchObject({ method: "PATCH", url: expect.stringContaining("/labels/bug") });
	});

	it("treats a null description as empty string when diffing", async () => {
		// GitHub returns null for labels with no description
		const canonical: CanonicalLabel[] = [{ name: "bug", color: "d73a4a", description: "" }];
		const { rest, calls } = makeRest([
			{ status: 200, body: [{ name: "bug", color: "d73a4a", description: null }] },
		]);

		const result = await syncLabels(rest, REPO, canonical, []);

		// null === "" after normalisation — no PATCH needed
		expect(result).toBe("0 created, 0 updated, 0 deleted");
		expect(calls).toHaveLength(1);
	});
});

// ── delete ────────────────────────────────────────────────────────────────────

describe("syncLabels — delete", () => {
	it("DELETEs stale labels that exist in the repo", async () => {
		const { rest, calls } = makeRest([
			{
				status: 200,
				body: [
					{ name: "bug", color: "d73a4a", description: "Something isn't working" },
					{ name: "github_actions", color: "000000", description: "" },
					{ name: "javascript", color: "111111", description: "" },
				],
			},
			// canonical: bug already matches — no POST/PATCH
			// DELETE github_actions
			{ status: 204, body: null },
			// DELETE javascript
			{ status: 204, body: null },
		]);

		const result = await syncLabels(rest, REPO, [CANONICAL[0]!], STALE);

		expect(result).toBe("0 created, 0 updated, 2 deleted");
		expect(calls[1]).toMatchObject({ method: "DELETE", url: expect.stringContaining("github_actions") });
		expect(calls[2]).toMatchObject({ method: "DELETE", url: expect.stringContaining("javascript") });
	});

	it("skips stale labels that are not present in the repo", async () => {
		const { rest, calls } = makeRest([
			{ status: 200, body: [{ name: "bug", color: "d73a4a", description: "Something isn't working" }] },
		]);

		const result = await syncLabels(rest, REPO, [CANONICAL[0]!], STALE);

		expect(result).toBe("0 created, 0 updated, 0 deleted");
		expect(calls).toHaveLength(1);
	});
});

// ── no-op ─────────────────────────────────────────────────────────────────────

describe("syncLabels — no-op", () => {
	it("makes no mutating calls when repo already matches canonical set", async () => {
		const { rest, calls } = makeRest([
			{
				status: 200,
				body: [
					{ name: "bug", color: "d73a4a", description: "Something isn't working" },
					{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
					{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
				],
			},
		]);

		const result = await syncLabels(rest, REPO, CANONICAL, STALE);

		expect(result).toBe("0 created, 0 updated, 0 deleted");
		expect(calls).toHaveLength(1);
	});
});
