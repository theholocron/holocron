import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { parseEnvironmentJson } from "./parse-environment-json.js";

describe("parseEnvironmentJson", () => {
	it("reads a bare array with the concealed flag", () => {
		const text = JSON.stringify([
			{ name: "TOKEN", value: "a", concealed: true },
			{ name: "PUBLIC_URL", value: "b", concealed: false },
		]);
		expect(parseEnvironmentJson(text)).toEqual([
			{ name: "TOKEN", value: "a", concealed: true },
			{ name: "PUBLIC_URL", value: "b", concealed: false },
		]);
	});

	it("reads an object that holds the list, a `key` for the name, and treats a missing flag or value safely", () => {
		const text = JSON.stringify({ secrets: [{ key: "K" }, { name: "N", value: "v", concealed: "yes" }] });
		expect(parseEnvironmentJson(text)).toEqual([
			{ name: "K", value: "", concealed: true },
			{ name: "N", value: "v", concealed: true },
		]);
	});

	it("skips an entry with no name and one that is not an object", () => {
		expect(parseEnvironmentJson(JSON.stringify([null, 3, { value: "x" }, { name: 4 }]))).toEqual([]);
	});

	it("throws a ProviderApiError for text that is not JSON or has no list", () => {
		expect(() => parseEnvironmentJson("not json")).toThrow(ProviderApiError);
		expect(() => parseEnvironmentJson("{}")).toThrow(/shape/);
		expect(() => parseEnvironmentJson("5")).toThrow(/shape/);
	});
});
