import { describe, expect, it } from "vitest";

import { classifySpecPath } from "./classify-spec-path.js";

describe("classifySpecPath", () => {
	it("calls a .md file in the ADR folder an adr", () => {
		expect(classifySpecPath("docs/wiki/decisions/0009-task-manifest.md")).toBe("adr");
	});

	it("leaves the ADR template, the README and non-markdown files alone", () => {
		expect(classifySpecPath("docs/wiki/decisions/template.md")).toBeUndefined();
		expect(classifySpecPath("docs/wiki/decisions/README.md")).toBeUndefined();
		expect(classifySpecPath("docs/wiki/decisions/0009.txt")).toBeUndefined();
	});

	it("calls a .spec.md file in .notes or the specifications folder a spec", () => {
		expect(classifySpecPath(".notes/tech-x.spec.md")).toBe("spec");
		expect(classifySpecPath("docs/wiki/specifications/tool-y.spec.md")).toBe("spec");
	});

	it("leaves other files in those folders, nested files and files elsewhere alone", () => {
		expect(classifySpecPath(".notes/scratch.md")).toBeUndefined();
		expect(classifySpecPath(".notes/README.md")).toBeUndefined();
		expect(classifySpecPath("docs/wiki/decisions/nested/0002-x.md")).toBeUndefined();
		expect(classifySpecPath("src/index.ts")).toBeUndefined();
		expect(classifySpecPath("README.md")).toBeUndefined();
	});
});
