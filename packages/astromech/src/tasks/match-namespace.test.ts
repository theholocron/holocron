import { describe, expect, it } from "vitest";

import { matchNamespace } from "./match-namespace.js";

describe("matchNamespace", () => {
	it("returns every configured task prefixed by `<namespace>.`, in declaration order, deduped", () => {
		const names = matchNamespace(
			{
				tasks: [
					"sourceQuality.staticAnalysis",
					"verification.unitTests",
					"sourceQuality.formatting",
					"sourceQuality.staticAnalysis", // duplicate entry — kept once
				],
			},
			"sourceQuality"
		);
		expect(names).toEqual(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]);
	});

	it("returns [] for a namespace with no matching tasks, and for no config at all", () => {
		expect(matchNamespace({ tasks: ["verification.unitTests"] }, "sourceQuality")).toEqual([]);
		expect(matchNamespace({}, "sourceQuality")).toEqual([]);
	});

	it("doesn't match an exact task name as its own namespace (no trailing dot in the task name itself)", () => {
		expect(matchNamespace({ tasks: ["sourceQuality"] }, "sourceQuality")).toEqual([]);
	});
});
