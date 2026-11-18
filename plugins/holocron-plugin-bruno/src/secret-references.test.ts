import { describe, expect, it } from "vitest";

import {
	healReferences,
	layeredName,
	referencedName,
	referenceTo,
	type SecretWiring,
	withSecretReferences,
} from "./secret-references.js";

const WIRING: SecretWiring = { refs: { s: "S_ENTRY" }, layers: { E: "dev", Prod: "prod" } };

describe("layeredName", () => {
	it("puts the layer word in capitals before the entry", () => {
		expect(layeredName("dev", "SENTINEL_WEBHOOK_SECRET")).toBe("DEV_SENTINEL_WEBHOOK_SECRET");
		expect(layeredName("prod", "X")).toBe("PROD_X");
	});
});

describe("healReferences", () => {
	const text = "name: E\nvariables:\n  - name: a\n    value: x\n  - secret: true\n    name: s\n";

	it("makes the named secrets references to their layer's copy in a written file", () => {
		const healed = healReferences(text, WIRING);
		expect(healed).toContain('value: "{{process.env.DEV_S_ENTRY}}"');
		expect(healed).not.toContain("secret: true");
		expect(healed).toContain("value: x");
	});

	it("moves a reference that names another layer's copy", () => {
		const stale = 'name: Prod\nvariables:\n  - name: s\n    value: "{{process.env.S_ENTRY}}"\n';
		expect(healReferences(stale, WIRING)).toContain('value: "{{process.env.PROD_S_ENTRY}}"');
	});

	it("returns the file byte for byte when there is nothing to change", () => {
		expect(healReferences(text, undefined)).toBe(text);
		expect(healReferences(text, { refs: { other: "O" }, layers: { E: "dev" } })).toBe(text);
		// An environment with no layer keeps its secrets blank.
		expect(healReferences(text, { refs: { s: "S_ENTRY" }, layers: {} })).toBe(text);
		const healed = healReferences(text, WIRING);
		expect(healReferences(healed, WIRING)).toBe(healed);
	});

	it("leaves a plain variable that is not a reference alone, even when the wiring names it", () => {
		const plain = "name: E\nvariables:\n  - name: s\n    value: typed\n";
		expect(healReferences(plain, WIRING)).toBe(plain);
	});

	it("reads a file with no variables", () => {
		expect(healReferences("name: E\n", WIRING)).toBe("name: E\n");
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
			{ name: "s", value: "", secret: true },
			{ name: "b", value: "", secret: true },
			{ name: "c", value: "x", secret: false },
		],
	};

	it("turns only the covered secrets into references to their layer's copy", () => {
		expect(withSecretReferences(environment, WIRING).variables).toEqual([
			{ name: "s", value: "{{process.env.DEV_S_ENTRY}}", secret: false },
			{ name: "b", value: "", secret: true },
			{ name: "c", value: "x", secret: false },
		]);
	});

	it("leaves an environment with no layer, or an unnamed one, with blank secrets", () => {
		expect(withSecretReferences(environment, { refs: WIRING.refs, layers: { Other: "dev" } }).variables).toEqual(
			environment.variables
		);
		const unnamed = { variables: environment.variables };
		expect(withSecretReferences(unnamed, WIRING).variables).toEqual(environment.variables);
	});

	it("returns the environment as it is with no wiring, or no variables", () => {
		expect(withSecretReferences(environment, undefined)).toBe(environment);
		const bare: { variables?: unknown[] } = {};
		expect(withSecretReferences(bare, WIRING)).toBe(bare);
	});
});
