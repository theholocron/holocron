import { describe, expect, it } from "vitest";

import { declaredVsActual } from "./declared-vs-actual.js";

describe("declaredVsActual", () => {
	const map = (o: Record<string, string>) => new Map(Object.entries(o));

	it("is empty when they match", () => {
		expect(declaredVsActual(map({ A: "1" }), map({ A: "1" }), { noun: "variable" })).toEqual([]);
	});

	it("names a declared key that is missing, a key that is not declared, and a value that differs", () => {
		const problems = declaredVsActual(map({ A: "1", B: "2", C: "3" }), map({ A: "1", C: "9", D: "4" }), {
			noun: "variable",
		});
		expect(problems).toEqual(["missing variable B", "variable C: declared 3, found 9", "unexpected variable D"]);
	});

	it("leaves out the keys that are not declared when asked to", () => {
		expect(
			declaredVsActual(map({ A: "1" }), map({ A: "1", D: "4" }), { noun: "secret", flagExtra: false })
		).toEqual([]);
	});

	it("compares and shows values the way it is told to", () => {
		const problems = declaredVsActual(new Map([["a", { n: 1 }]]), new Map([["a", { n: 2 }]]), {
			noun: "check",
			equal: (x, y) => x.n === y.n,
			show: (v) => `n=${v.n}`,
		});
		expect(problems).toEqual(["check a: declared n=1, found n=2"]);
	});
});
