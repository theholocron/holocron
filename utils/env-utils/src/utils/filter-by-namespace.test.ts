import { describe, expect, it } from "vitest";

import { filterByNamespace, mergeNamespaces } from "./filter-by-namespace.js";

describe("filterByNamespace", () => {
	it("returns only vars that start with the prefix", () => {
		const raw = {
			HOLOCRON_DEBUG: "true",
			HOLOCRON_VERBOSE: "false",
			PORT: "3000",
			OTHER_VAR: "x",
		};
		expect(filterByNamespace(raw, "HOLOCRON")).toEqual({
			DEBUG: "true",
			VERBOSE: "false",
		});
	});

	it("strips the prefix from the returned keys", () => {
		const raw = { CLI_TEMPLATE_SOUND: "true" };
		expect(filterByNamespace(raw, "CLI_TEMPLATE")).toEqual({ SOUND: "true" });
	});

	it("is case-insensitive for the prefix match", () => {
		const raw = { holocron_debug: "true", HOLOCRON_VERBOSE: "false" };
		expect(filterByNamespace(raw, "HOLOCRON")).toEqual({
			debug: "true",
			VERBOSE: "false",
		});
	});

	it("returns an empty object when no keys match", () => {
		const raw = { PORT: "3000", NODE_ENV: "test" };
		expect(filterByNamespace(raw, "HOLOCRON")).toEqual({});
	});

	it("excludes vars that only match the prefix without the trailing underscore", () => {
		const raw = { HOLOCRON: "oops", HOLOCRON_DEBUG: "true" };
		expect(filterByNamespace(raw, "HOLOCRON")).toEqual({ DEBUG: "true" });
	});

	it("handles undefined values", () => {
		const raw: Record<string, string | undefined> = {
			HOLOCRON_DEBUG: undefined,
			HOLOCRON_VERBOSE: "true",
		};
		expect(filterByNamespace(raw, "HOLOCRON")).toEqual({
			DEBUG: undefined,
			VERBOSE: "true",
		});
	});
});

describe("mergeNamespaces", () => {
	it("merges vars from all namespaces", () => {
		const raw = {
			HOLOCRON_DEBUG: "true",
			CLI_TEMPLATE_SOUND: "false",
		};
		expect(mergeNamespaces(raw, ["HOLOCRON", "CLI_TEMPLATE"])).toEqual({
			DEBUG: "true",
			SOUND: "false",
		});
	});

	it("last namespace wins when the same key exists in multiple namespaces", () => {
		const raw = {
			HOLOCRON_DEBUG: "true",
			CLI_TEMPLATE_DEBUG: "false",
		};
		// CLI_TEMPLATE is last = more specific = overrides HOLOCRON
		expect(mergeNamespaces(raw, ["HOLOCRON", "CLI_TEMPLATE"])).toEqual({
			DEBUG: "false",
		});
	});

	it("earlier namespace acts as base/fallback when the key is absent from later ones", () => {
		const raw = {
			HOLOCRON_VERBOSE: "true",
			CLI_TEMPLATE_DEBUG: "false",
		};
		// HOLOCRON provides VERBOSE; CLI_TEMPLATE provides DEBUG and overrides nothing
		expect(mergeNamespaces(raw, ["HOLOCRON", "CLI_TEMPLATE"])).toEqual({
			DEBUG: "false",
			VERBOSE: "true",
		});
	});

	it("returns an empty object when no namespaces are given", () => {
		const raw = { HOLOCRON_DEBUG: "true" };
		expect(mergeNamespaces(raw, [])).toEqual({});
	});
});
