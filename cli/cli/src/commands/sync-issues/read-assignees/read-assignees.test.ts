import { describe, expect, it, vi } from "vitest";

import type { Source } from "../../../plugin/index.js";
import { readAssignees } from "./read-assignees.js";

const sourceReading = (content: string | undefined) =>
	({ readFile: vi.fn(async () => (content === undefined ? undefined : { content, sha: "x" })) }) as unknown as Source;
const text = JSON.stringify({ version: 1, links: [{ login: "octocat", email: "o@acme.dev" }] });

describe("readAssignees", () => {
	it("reads issues/assignees.json from the org's private config repo", async () => {
		const source = sourceReading(text);
		await expect(readAssignees(source, "acme")).resolves.toEqual([{ login: "octocat", email: "o@acme.dev" }]);
		expect(source.readFile).toHaveBeenCalledWith("issues/assignees.json", "acme/.github-private");
	});

	it("is an empty map when the file is not there or there is no source that can read files", async () => {
		await expect(readAssignees(sourceReading(undefined), "acme")).resolves.toEqual([]);
		await expect(readAssignees(undefined, "acme")).resolves.toEqual([]);
		await expect(readAssignees({} as Source, "acme")).resolves.toEqual([]);
	});

	it("names the file when it is damaged", async () => {
		await expect(readAssignees(sourceReading("{"), "acme")).rejects.toThrow(
			"acme/.github-private/issues/assignees.json: the assignees file is not valid JSON"
		);
	});

	it("asks for an org when there is none", async () => {
		await expect(readAssignees(sourceReading(text), undefined)).rejects.toThrow(/no org/);
	});
});
