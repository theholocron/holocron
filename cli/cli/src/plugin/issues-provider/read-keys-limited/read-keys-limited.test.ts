import { describe, expect, it } from "vitest";

import { readKeysLimited } from "./read-keys-limited.js";

interface Item {
	key: string;
	skip?: boolean;
}

function setup(skipped: string[] = []) {
	const fetched: string[] = [];
	return {
		fetched,
		fetch: async (key: string): Promise<Item> => {
			fetched.push(key);
			return { key, skip: skipped.includes(key) };
		},
		keep: (i: Item) => !i.skip,
	};
}

const keys = ["#5", "#1", "#4", "#2", "#3", "#6"];

describe("readKeysLimited", () => {
	it("fetches only the oldest keys, and no more than the limit", async () => {
		const s = setup();
		const out = await readKeysLimited({ keys, order: "oldest", limit: 2, concurrency: 4, ...s });
		expect(out.map((i) => i.key)).toEqual(["#1", "#2"]);
		expect(s.fetched).toEqual(["#1", "#2"]);
	});

	it("fetches only the newest keys and returns them oldest first", async () => {
		const s = setup();
		const out = await readKeysLimited({ keys, order: "newest", limit: 3, concurrency: 2, ...s });
		expect(out.map((i) => i.key)).toEqual(["#4", "#5", "#6"]);
		expect(s.fetched).toEqual(["#6", "#5", "#4"]);
	});

	it("goes on to the next key when one is skipped, so a skip never uses the budget", async () => {
		const s = setup(["#1", "#2"]);
		const out = await readKeysLimited({ keys, order: "oldest", limit: 2, concurrency: 4, ...s });
		expect(out.map((i) => i.key)).toEqual(["#3", "#4"]);
		expect(s.fetched).toEqual(["#1", "#2", "#3", "#4"]);
	});

	it("stops when the keys run out", async () => {
		const s = setup(["#1"]);
		const out = await readKeysLimited({ keys: ["#1", "#2"], order: "oldest", limit: 5, concurrency: 4, ...s });
		expect(out.map((i) => i.key)).toEqual(["#2"]);
	});

	it("never has more than `concurrency` fetches in flight", async () => {
		let active = 0;
		let peak = 0;
		const out = await readKeysLimited({
			keys: ["#1", "#2", "#3", "#4", "#5", "#6"],
			order: "oldest",
			limit: 6,
			concurrency: 4,
			fetch: async (key) => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((r) => setTimeout(r, 1));
				active--;
				return { key };
			},
			keep: () => true,
		});
		expect(out).toHaveLength(6);
		expect(peak).toBe(4);
	});
});
