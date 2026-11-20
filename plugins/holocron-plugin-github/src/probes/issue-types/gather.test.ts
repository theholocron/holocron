import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { fakeApi, item } from "./backfill.testing.js";
import { gather } from "./gather.js";
import type { BackfillOptions } from "./issue-types.type.js";

const base: BackfillOptions = { after: 0, limit: 100, pullRequests: false };
const limited = (e: unknown) => e instanceof ProviderApiError;
const numbers = (g: { items: Array<{ number: number }> }) => g.items.map((i) => i.number);

describe("gather", () => {
	const all = [
		item(1, { createdAt: "2026-01-01T00:00:00Z" }),
		item(2, { isPullRequest: true }),
		item(3, { createdAt: "2026-09-01T00:00:00Z" }),
		item(4),
	];

	it("reads every page oldest first and passes over pull requests", async () => {
		const { api } = fakeApi({}, { items: all });
		const read = await gather(api, base, limited);
		expect(numbers(read)).toEqual([1, 3, 4]);
		expect(read).toMatchObject({ more: false, rateLimited: false, pullRequestsSkipped: 1 });
	});

	it("keeps pull requests when asked", async () => {
		const { api } = fakeApi({}, { items: all });
		expect(numbers(await gather(api, { ...base, pullRequests: true }, limited))).toEqual([1, 2, 3, 4]);
	});

	it("starts after the cursor and on or after --since", async () => {
		const { api } = fakeApi({}, { items: all });
		expect(numbers(await gather(api, { ...base, after: 1, since: "2026-09-01" }, limited))).toEqual([3, 4]);
	});

	it("stops at the limit and says there is more", async () => {
		const { api } = fakeApi({}, { items: all });
		const read = await gather(api, { ...base, limit: 2 }, limited);
		expect(numbers(read)).toEqual([1, 3]);
		expect(read.more).toBe(true);
	});

	it("is not more when the limit is exactly the rest", async () => {
		const { api } = fakeApi({}, { items: all });
		expect((await gather(api, { ...base, limit: 3 }, limited)).more).toBe(false);
	});

	it("keeps what it read when a page is refused for the rate limit", async () => {
		const err = new ProviderApiError("rate limit", 429);
		const { api } = fakeApi({
			list: async (page) => {
				if (page === 2) throw err;
				return Array.from({ length: 100 }, (_, i) => item(i + 1));
			},
		});
		const read = await gather(api, { ...base, limit: 500 }, limited);
		expect(read.items).toHaveLength(100);
		expect(read).toMatchObject({ more: true, rateLimited: true });
	});

	it("throws any other failure of a page", async () => {
		const { api } = fakeApi({
			list: async () => {
				throw new Error("boom");
			},
		});
		await expect(gather(api, base, limited)).rejects.toThrow("boom");
	});

	describe("with --issues", () => {
		it("reads those past the cursor, in order, without duplicates", async () => {
			const { api } = fakeApi({}, { items: all });
			const read = await gather(api, { ...base, issues: [4, 3, 3, 1], after: 1 }, limited);
			expect(numbers(read)).toEqual([3, 4]);
			expect(read.more).toBe(false);
		});

		it("reads a number the listing does not hold", async () => {
			const { api } = fakeApi({}, { items: all });
			expect(numbers(await gather(api, { ...base, issues: [99] }, limited))).toEqual([99]);
		});

		it("passes over a pull request, and keeps one when asked", async () => {
			const { api } = fakeApi({}, { items: all });
			const without = await gather(api, { ...base, issues: [2, 3] }, limited);
			expect([numbers(without), without.pullRequestsSkipped]).toEqual([[3], 1]);
			const withPrs = await gather(api, { ...base, issues: [2, 3], pullRequests: true }, limited);
			expect(numbers(withPrs)).toEqual([2, 3]);
		});

		it("cuts the list at the limit", async () => {
			const { api } = fakeApi({}, { items: all });
			const read = await gather(api, { ...base, issues: [1, 3, 4], limit: 2 }, limited);
			expect([numbers(read), read.more]).toEqual([[1, 3], true]);
		});

		it("stops on the rate limit and throws any other failure", async () => {
			const rate = new ProviderApiError("rate limit", 429);
			const { api } = fakeApi({
				get: async (n) => {
					if (n === 2) throw rate;
					return item(n);
				},
			});
			const read = await gather(api, { ...base, issues: [1, 2, 3] }, limited);
			expect([numbers(read), read.rateLimited, read.more]).toEqual([[1], true, true]);
			const broken = fakeApi({
				get: async () => {
					throw new Error("gone");
				},
			}).api;
			await expect(gather(broken, { ...base, issues: [1] }, limited)).rejects.toThrow("gone");
		});
	});
});
