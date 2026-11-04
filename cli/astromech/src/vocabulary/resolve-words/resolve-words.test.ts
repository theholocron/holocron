import { describe, expect, it } from "vitest";

import { resolveWords } from "./resolve-words.js";

describe("resolveWords", () => {
	it("reads a suite on its own", () => {
		expect(resolveWords(["test"])).toEqual({ kind: "suite", suite: "test", rest: [] });
	});

	it("joins a suite and its qualifier with a colon: `test unit` is `test:unit`", () => {
		expect(resolveWords(["test", "unit"])).toEqual({ kind: "task", targets: [{ id: "test:unit" }], rest: [] });
		expect(resolveWords(["test:unit"])).toEqual({ kind: "task", targets: [{ id: "test:unit" }], rest: [] });
	});

	it("takes the longest match and leaves the rest as the job argument", () => {
		expect(resolveWords(["test", "unit", "storybook"])).toEqual({
			kind: "task",
			targets: [{ id: "test:unit" }],
			rest: ["storybook"],
		});
		expect(resolveWords(["build", "src/"])).toEqual({ kind: "task", targets: [{ id: "build" }], rest: ["src/"] });
		expect(resolveWords(["test", "storybook"])).toEqual({ kind: "suite", suite: "test", rest: ["storybook"] });
	});

	it("reads a hyphen compound in any of its three spellings", () => {
		for (const words of [["deploy-preview"], ["deploy:preview"], ["deploy", "preview"]]) {
			expect(resolveWords(words)).toEqual({ kind: "task", targets: [{ id: "deploy-preview" }], rest: [] });
		}
		// `deploy` alone is still the one leaf, not a suite.
		expect(resolveWords(["deploy"])).toEqual({ kind: "task", targets: [{ id: "deploy" }], rest: [] });
	});

	it("reads an old dotted name and remembers it", () => {
		expect(resolveWords(["verification.unitTests"])).toEqual({
			kind: "task",
			targets: [{ id: "test:unit" }],
			rest: [],
			legacy: "verification.unitTests",
		});
		expect(resolveWords(["platform.repoValidation", "adrs"])).toEqual({
			kind: "task",
			targets: [{ id: "validate:specs" }, { id: "validate:docs" }],
			rest: ["adrs"],
			legacy: "platform.repoValidation",
		});
	});

	it("is unknown for a name that is nothing, and for no words", () => {
		expect(resolveWords(["nope"])).toEqual({ kind: "unknown" });
		expect(resolveWords(["nope", "unit"])).toEqual({ kind: "unknown" });
		expect(resolveWords([])).toEqual({ kind: "unknown" });
	});
});
