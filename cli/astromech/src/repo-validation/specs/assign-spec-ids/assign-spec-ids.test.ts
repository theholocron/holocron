import { describe, expect, it } from "vitest";

import { assignSpecIds } from "./assign-spec-ids.js";

describe("assignSpecIds", () => {
	it("numbers specs without an id from the first, oldest first", () => {
		const ids = assignSpecIds([
			{ path: ".notes/c.spec.md", id: undefined, time: 300 },
			{ path: ".notes/a.spec.md", id: undefined, time: 100 },
			{ path: ".notes/b.spec.md", id: undefined, time: 200 },
		]);

		expect([...ids]).toEqual([
			[".notes/a.spec.md", "SPEC-0001"],
			[".notes/b.spec.md", "SPEC-0002"],
			[".notes/c.spec.md", "SPEC-0003"],
		]);
	});

	it("takes the numbers after the highest one in use, and leaves a spec that has an id alone", () => {
		const ids = assignSpecIds([
			{ path: ".notes/old.spec.md", id: "SPEC-0007", time: 1 },
			{ path: ".notes/new.spec.md", id: undefined, time: 2 },
		]);

		expect([...ids]).toEqual([[".notes/new.spec.md", "SPEC-0008"]]);
	});

	it("puts a spec with no known time after the ones with one, and breaks ties by path", () => {
		const ids = assignSpecIds([
			{ path: ".notes/z.spec.md", id: undefined, time: undefined },
			{ path: ".notes/b.spec.md", id: undefined, time: 5 },
			{ path: ".notes/a.spec.md", id: undefined, time: 5 },
			{ path: ".notes/m.spec.md", id: undefined, time: undefined },
		]);

		expect([...ids].map(([path]) => path)).toEqual([
			".notes/a.spec.md",
			".notes/b.spec.md",
			".notes/m.spec.md",
			".notes/z.spec.md",
		]);
	});

	it("ignores an id that is not of the SPEC-NNNN kind when counting, and keeps going past four digits", () => {
		const ids = assignSpecIds([
			{ path: ".notes/odd.spec.md", id: "draft-1", time: 1 },
			{ path: ".notes/big.spec.md", id: "SPEC-9999", time: 2 },
			{ path: ".notes/next.spec.md", id: undefined, time: 3 },
			{ path: ".notes/after.spec.md", id: undefined, time: 4 },
		]);

		expect(ids.get(".notes/next.spec.md")).toBe("SPEC-10000");
		expect(ids.get(".notes/after.spec.md")).toBe("SPEC-10001");
		expect(ids.has(".notes/odd.spec.md")).toBe(false);
	});

	it("is empty when every spec has an id, or there are none", () => {
		expect(assignSpecIds([{ path: ".notes/a.spec.md", id: "SPEC-0001", time: 1 }]).size).toBe(0);
		expect(assignSpecIds([]).size).toBe(0);
	});
});
