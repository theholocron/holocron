import { describe, expect, it } from "vitest";

import { matchNamespace } from "./match-namespace.js";

describe("matchNamespace", () => {
	it("returns the ids of every configured task that was under the old namespace, in declaration order, deduped", () => {
		const found = matchNamespace(
			{
				tasks: [
					"sourceQuality.staticAnalysis",
					"verification.unitTests",
					"sourceQuality.deadCodeAnalysis",
					"sourceQuality.staticAnalysis", // duplicate entry — kept once
				],
			},
			"sourceQuality"
		);
		expect(found).toEqual([{ id: "lint:code" }, { id: "lint:unused" }]);
	});

	it("matches a task spelled with a flat id through the old name it replaced", () => {
		expect(matchNamespace({ tasks: ["lint:code", "test:unit"] }, "verification")).toEqual([{ id: "test:unit" }]);
	});

	it("expands an old name that stood for several tasks, keeping the args it implied", () => {
		expect(matchNamespace({ tasks: ["sourceQuality.formatting"] }, "sourceQuality")).toEqual([
			{ id: "lint:editorconfig" },
			{ id: "lint:markdown" },
			{ id: "format", passthrough: ["--check"] },
		]);
	});

	it("returns [] for a namespace with no matching tasks, and for no config at all", () => {
		expect(matchNamespace({ tasks: ["verification.unitTests"] }, "sourceQuality")).toEqual([]);
		expect(matchNamespace({}, "sourceQuality")).toEqual([]);
	});

	it("doesn't match an exact task name as its own namespace (no trailing dot in the task name itself)", () => {
		expect(matchNamespace({ tasks: ["sourceQuality"] }, "sourceQuality")).toEqual([]);
	});
});
