import { describe, expect, it } from "vitest";

import { parseAssignees } from "./parse-assignees.js";

const file = (links: unknown, version: unknown = 1) => JSON.stringify({ version, links });
const errorOf = (text: string) => {
	try {
		parseAssignees(text);
	} catch (err) {
		return (err as Error).message;
	}
	return undefined;
};

describe("parseAssignees", () => {
	it("reads the pairs, trimmed", () => {
		expect(parseAssignees(file([{ login: " octocat ", email: "o@acme.dev " }]))).toEqual({
			version: 1,
			links: [{ login: "octocat", email: "o@acme.dev" }],
		});
	});

	it("reads an empty list", () => {
		expect(parseAssignees(file([]))).toEqual({ version: 1, links: [] });
	});

	it("names what is wrong, never reading a damaged file as empty", () => {
		expect(errorOf("{")).toBe("the assignees file is not valid JSON");
		expect(errorOf(file([], 2))).toBe("the assignees file has version 2; expected 1");
		expect(errorOf(JSON.stringify({ version: 1 }))).toBe("the assignees file has no `links` list");
		expect(errorOf(file([{ login: "", email: "o@acme.dev" }]))).toBe("links[0]: `login` must be a string");
		expect(errorOf(file([{ login: 7, email: "o@acme.dev" }]))).toBe("links[0]: `login` must be a string");
		expect(errorOf(file([{ login: "a", email: "nope" }]))).toBe("links[0]: `email` must be an email address");
		expect(errorOf(file([{ login: "a" }]))).toBe("links[0]: `email` must be an email address");
	});

	it("refuses a login or an email that appears twice, whatever its case", () => {
		expect(
			errorOf(
				file([
					{ login: "Octocat", email: "a@acme.dev" },
					{ login: "octocat", email: "b@acme.dev" },
				])
			)
		).toBe("links[1]: `login` octocat appears more than once");
		expect(
			errorOf(
				file([
					{ login: "a", email: "x@acme.dev" },
					{ login: "b", email: "X@acme.dev" },
				])
			)
		).toBe("links[1]: `email` X@acme.dev appears more than once");
	});
});
