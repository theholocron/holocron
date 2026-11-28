import { describe, expect, it } from "vitest";

import { readRepoAreas } from "./repo-areas.js";

/** A repository whose files are `files` (path to text); asking for any other path answers `null`. */
const repo = (files: Record<string, string>) => ({ readFile: async (path: string) => files[path] ?? null });

const JSON_FILE = ".holocron/repo.json";

describe("readRepoAreas", () => {
	it("reads the areas and scopes from .holocron/repo.json", async () => {
		const found = await readRepoAreas(
			repo({
				[JSON_FILE]: JSON.stringify({ labels: { areas: { docs: ["docs/**"] }, scopes: { site: "docs" } } }),
			})
		);
		expect(found.areas).toEqual({ areas: { docs: ["docs/**"] }, scopes: { site: "docs" } });
		expect(found.row).toEqual({ status: "info", label: "area labels", detail: `read from ${JSON_FILE}` });
	});

	it("reads areas with no scopes", async () => {
		const found = await readRepoAreas(
			repo({ [JSON_FILE]: JSON.stringify({ labels: { areas: { a: ["a/**"] } } }) })
		);
		expect(found.areas).toEqual({ areas: { a: ["a/**"] }, scopes: {} });
	});

	it("fails the row, and adds no area, for a file that is not JSON", async () => {
		const found = await readRepoAreas(repo({ [JSON_FILE]: "{ nope" }));
		expect(found.areas).toEqual({});
		expect(found.row.status).toBe("fail");
		expect(found.row.detail).toMatch(/\.holocron\/repo\.json is not JSON/);
	});

	it.each([
		["no labels", {}],
		["a file that is not an object", []],
		["a null file", null],
		["labels with no areas", { labels: {} }],
		["labels that are not an object", { labels: "x" }],
		["empty areas", { labels: { areas: {} } }],
		["areas that are not lists", { labels: { areas: { a: "a/**" } } }],
		["patterns that are not text", { labels: { areas: { a: [3] } } }],
		["scopes that are not text", { labels: { areas: { a: ["a/**"] }, scopes: { s: 3 } } }],
	])("skips the area step for %s", async (_name, content) => {
		const found = await readRepoAreas(repo({ [JSON_FILE]: JSON.stringify(content) }));
		expect(found.areas).toEqual({});
		expect(found.row.status).toBe("info");
		expect(found.row.detail).toMatch(/^skipped: \.holocron\/repo\.json declares no usable/);
	});

	it("says a repo.ts it cannot evaluate is why there is no area step", async () => {
		const found = await readRepoAreas(repo({ ".holocron/repo.ts": "export default {}" }));
		expect(found.areas).toEqual({});
		expect(found.row.detail).toMatch(/^skipped: its areas are in \.holocron\/repo\.ts.*cannot evaluate/);
	});

	it("says a repository with neither file has no area step", async () => {
		const found = await readRepoAreas(repo({}));
		expect(found).toEqual({
			areas: {},
			row: {
				status: "info",
				label: "area labels",
				detail: "skipped: it has no .holocron/repo.json or .holocron/repo.ts, so no area labels are added",
			},
		});
	});
});
