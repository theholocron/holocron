import { describe, expect, it } from "vitest";

import { MissingTokenError, ProviderApiError } from "../../../plugin/index.js";
import { issueTypesRow } from "./issue-types-row.js";

const bug = { id: 7, name: "Bug", description: "x", color: "red", enabled: true };
const reading = (listTypes: () => Promise<(typeof bug)[] | undefined>) => ({ listTypes });
const WHY = "no `issues` provider";

describe("issueTypesRow", () => {
	it("skips with no declaration, an empty one, no provider or no listTypes", async () => {
		expect(
			(
				await issueTypesRow(
					undefined,
					reading(async () => [bug]),
					WHY
				)
			).detail
		).toContain("no `issueTypes`");
		expect(
			(
				await issueTypesRow(
					[],
					reading(async () => [bug]),
					WHY
				)
			).status
		).toBe("skip");
		expect((await issueTypesRow([{ name: "Bug" }], undefined, WHY)).detail).toBe(WHY);
		const row = await issueTypesRow([{ name: "Bug" }], {}, WHY);
		expect([row.status, row.detail]).toEqual(["skip", "provider does not implement listTypes"]);
	});

	it("skips naming the permission when the list is unreadable or refused", async () => {
		const none = await issueTypesRow(
			[{ name: "Bug" }],
			reading(async () => undefined),
			WHY
		);
		expect(none.status).toBe("skip");
		expect(none.detail).toContain("Issue types: read");
		for (const status of [401, 403]) {
			const refused = await issueTypesRow(
				[{ name: "Bug" }],
				reading(async () => {
					throw new ProviderApiError("no", status);
				}),
				WHY
			);
			expect([refused.status, refused.detail]).toEqual(["skip", none.detail]);
		}
	});

	it("skips for a missing token and fails for any other error", async () => {
		const noToken = await issueTypesRow(
			[{ name: "Bug" }],
			reading(async () => {
				throw new MissingTokenError("needs the org token");
			}),
			WHY
		);
		expect([noToken.status, noToken.detail]).toEqual(["skip", "needs the org token"]);
		const boom = await issueTypesRow(
			[{ name: "Bug" }],
			reading(async () => {
				throw new Error("boom");
			}),
			WHY
		);
		expect([boom.status, boom.detail]).toEqual(["fail", "boom"]);
	});

	it("passes with info notes, and fails naming a missing Type", async () => {
		const ok = await issueTypesRow(
			[{ name: "Bug", color: "blue" }],
			reading(async () => [bug]),
			WHY
		);
		expect(ok.status).toBe("ok");
		expect(ok.detail).toMatch(/^1 of 1 match; info: Bug colour was red, declared blue/);
		const bad = await issueTypesRow(
			[{ name: "Bug" }, { name: "Epic" }],
			reading(async () => [bug]),
			WHY
		);
		expect(bad.status).toBe("fail");
		expect(bad.detail).toBe("1 problem(s)");
		expect(bad.problems[0]).toContain("Epic");
	});
});
