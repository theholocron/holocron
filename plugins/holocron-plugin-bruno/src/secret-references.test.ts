import { describe, expect, it } from "vitest";

import { healReferences, referencedName, referenceTo, withSecretReferences } from "./secret-references.js";

describe("healReferences", () => {
	const text = "name: E\nvariables:\n  - name: a\n    value: x\n  - secret: true\n    name: s\n";

	it("makes the named secrets references in a written file", () => {
		const healed = healReferences(text, { s: "S_ENTRY" });
		expect(healed).toContain('value: "{{process.env.S_ENTRY}}"');
		expect(healed).not.toContain("secret: true");
		expect(healed).toContain("value: x");
	});

	it("returns the file byte for byte when there is nothing to change", () => {
		expect(healReferences(text, undefined)).toBe(text);
		expect(healReferences(text, { other: "O" })).toBe(text);
		const healed = healReferences(text, { s: "S_ENTRY" });
		expect(healReferences(healed, { s: "S_ENTRY" })).toBe(healed);
	});

	it("reads a file with no variables", () => {
		expect(healReferences("name: E\n", { s: "S" })).toBe("name: E\n");
	});
});

describe("referencedName", () => {
	it("reads the entry a value refers to, with or without spaces inside the braces", () => {
		expect(referencedName("{{process.env.A_SECRET}}")).toBe("A_SECRET");
		expect(referencedName(" {{ process.env._x1 }} ")).toBe("_x1");
	});

	it("is undefined for anything that is not exactly one reference", () => {
		for (const value of [
			"",
			"plain",
			"{{baseUrl}}",
			"a{{process.env.A}}",
			"{{process.env.A}}b",
			"{{process.env.1A}}",
		]) {
			expect(referencedName(value)).toBeUndefined();
		}
		expect(referencedName(undefined)).toBeUndefined();
	});

	it("round-trips with referenceTo", () => {
		expect(referencedName(referenceTo("NAME"))).toBe("NAME");
	});
});

describe("withSecretReferences", () => {
	const environment = {
		name: "E",
		variables: [
			{ name: "a", value: "", secret: true },
			{ name: "b", value: "", secret: true },
			{ name: "c", value: "x", secret: false },
		],
	};

	it("turns only the named secrets into references", () => {
		expect(withSecretReferences(environment, { a: "A_SECRET", c: "C" }).variables).toEqual([
			{ name: "a", value: "{{process.env.A_SECRET}}", secret: false },
			{ name: "b", value: "", secret: true },
			{ name: "c", value: "x", secret: false },
		]);
	});

	it("returns the environment as it is with no references, or no variables", () => {
		expect(withSecretReferences(environment, undefined)).toBe(environment);
		const bare: { variables?: unknown[] } = {};
		expect(withSecretReferences(bare, { a: "A" })).toBe(bare);
	});
});
