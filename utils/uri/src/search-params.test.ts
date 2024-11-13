import { describe, expect, test } from "vitest";
import * as uri from "./index.ts";

describe("Search Parameters", () => {
	test("return the value of an existing parameter", () => {
		const url = "https://example.com?name=JohnDoe";
		expect(uri.getParam(url, "name")).toBe("JohnDoe");
	});

	test("return null if the parameter does not exist", () => {
		const url = "https://example.com?name=JohnDoe";
		expect(uri.getParam(url, "age")).toBeNull();
	});

	test("return an empty string if the parameter is present but empty", () => {
		const url = "https://example.com?name=";
		expect(uri.getParam(url, "name")).toBe("");
	});

	test("return the value of the first parameter if multiple with the same name exist", () => {
		const url = "https://example.com?name=JohnDoe&name=JaneDoe";
		expect(uri.getParam(url, "name")).toBe("JohnDoe");
	});

	test("handle URLs without query parameters", () => {
		const url = "https://example.com";
		expect(uri.getParam(url, "name")).toBe("");
	});
});
