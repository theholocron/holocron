import { describe, expect, it } from "vitest";

import { mergeByKey } from "./merge-by-key.js";

describe("mergeByKey", () => {
	it("replaces a repeated key in place and appends new ones", () => {
		const s = mergeByKey<{ k: string; v: number }>((e) => e.k);
		expect(s.empty).toEqual([]);
		expect(
			s.merge(
				[
					{ k: "a", v: 1 },
					{ k: "b", v: 1 },
				],
				[
					{ k: "a", v: 2 },
					{ k: "c", v: 2 },
				]
			)
		).toEqual([
			{ k: "a", v: 2 },
			{ k: "b", v: 1 },
			{ k: "c", v: 2 },
		]);
	});
});
