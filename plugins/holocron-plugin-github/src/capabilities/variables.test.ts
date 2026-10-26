import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { syncOrgVariables, syncVariables } from "./variables.js";

const REPO = "theholocron/holocron";

function make(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "pat", fetch }), calls };
}
const listing = (...vars: Array<{ name: string; value: string; visibility?: string }>) => ({
	body: { total_count: vars.length, variables: vars },
});
const writes = <T extends { method: string }>(calls: T[]) => calls.filter((c) => c.method !== "GET");

describe("syncVariables", () => {
	it("creates what is missing, updates what differs and leaves what matches", async () => {
		const { client, calls } = make([
			listing({ name: "SAME", value: "1" }, { name: "CHANGED", value: "old" }),
			{ status: 204 },
			{ status: 201 },
		]);
		const summary = await syncVariables(client, REPO, { SAME: "1", CHANGED: "new", FRESH: "x" });
		expect(summary).toBe("1 created, 1 updated, 1 unchanged");
		expect(writes(calls).map((c) => [c.method, new URL(c.url).pathname])).toEqual([
			["PATCH", "/repos/theholocron/holocron/actions/variables/CHANGED"],
			["POST", "/repos/theholocron/holocron/actions/variables"],
		]);
	});

	it("writes nothing when everything already matches", async () => {
		const { client, calls } = make([listing({ name: "A", value: "1" })]);
		expect(await syncVariables(client, REPO, { A: "1" })).toBe("0 created, 0 updated, 1 unchanged");
		expect(writes(calls)).toEqual([]);
	});

	it("names the variables it does not declare and leaves them", async () => {
		const { client, calls } = make([listing({ name: "A", value: "1" }, { name: "STRAY", value: "z" })]);
		expect(await syncVariables(client, REPO, { A: "1" })).toBe(
			"0 created, 0 updated, 1 unchanged, 1 not declared, left alone: STRAY"
		);
		expect(writes(calls)).toEqual([]);
	});

	it("deletes the undeclared ones only with prune", async () => {
		const { client, calls } = make([
			listing({ name: "A", value: "1" }, { name: "STRAY", value: "z" }),
			{ status: 204 },
		]);
		expect(await syncVariables(client, REPO, { A: "1" }, { prune: true })).toBe(
			"0 created, 0 updated, 1 unchanged, 1 deleted"
		);
		expect(writes(calls).map((c) => c.method)).toEqual(["DELETE"]);
	});

	it("updates instead when someone created it since the listing", async () => {
		const { client, calls } = make([
			listing(),
			{ status: 409, body: { message: "Already exists" } },
			{ status: 204 },
		]);
		expect(await syncVariables(client, REPO, { A: "1" })).toBe("0 created, 1 updated, 0 unchanged");
		expect(writes(calls).map((c) => c.method)).toEqual(["POST", "PATCH"]);
	});

	it("passes any other create failure on", async () => {
		const { client } = make([listing(), { status: 403, body: { message: "Forbidden" } }]);
		await expect(syncVariables(client, REPO, { A: "1" })).rejects.toThrow();
	});

	it("refuses a name GitHub would reject, before touching anything", async () => {
		for (const name of ["1ABC", "HAS-DASH", "GITHUB_TOKEN", "github_x", "with space"]) {
			const { client, calls } = make([]);
			await expect(syncVariables(client, REPO, { [name]: "x" })).rejects.toThrow(/invalid variable name/);
			expect(calls).toEqual([]);
		}
	});
});

describe("syncOrgVariables", () => {
	it("reconciles the organization's variables with their visibility", async () => {
		const { client, calls } = make([
			listing(
				{ name: "TURBO_TEAM", value: "iamnewton", visibility: "all" },
				{ name: "OLD", value: "v", visibility: "selected" }
			),
			{ status: 204 },
			{ status: 201 },
		]);
		const summary = await syncOrgVariables(client, REPO, "theholocron", {
			TURBO_TEAM: { value: "iamnewton", visibility: "all" },
			OLD: { value: "v", visibility: "all" },
			NEW_ONE: { value: "n", visibility: "private" },
		});
		expect(summary).toBe("1 created, 1 updated, 1 unchanged");
		const [updated, created] = writes(calls);
		expect(new URL(created!.url).pathname).toBe("/orgs/theholocron/actions/variables");
		expect(created!.body).toEqual({ name: "NEW_ONE", value: "n", visibility: "private" });
		// A different visibility alone is a change, even with the same value.
		expect(new URL(updated!.url).pathname).toBe("/orgs/theholocron/actions/variables/OLD");
		expect(updated!.body).toEqual({ name: "OLD", value: "v", visibility: "all" });
	});
});
