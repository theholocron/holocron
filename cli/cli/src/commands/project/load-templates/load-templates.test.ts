import { describe, expect, it } from "vitest";

import { loadTemplates, type TemplatesIo } from "./index.js";

function io(files: Record<string, string>): TemplatesIo {
	return {
		listFiles: async () => Object.keys(files),
		readFile: async (path) => files[path.split("/").pop() as string] as string,
	};
}

const whole = {
	statuses: [{ name: "Fixed", category: "done" }],
	fields: [],
	views: [{ name: "All", layout: "table" }],
};

describe("loadTemplates", () => {
	it("returns the built-ins when the directory has no files", async () => {
		const result = await loadTemplates(".holocron/projects", io({}));
		expect(Object.keys(result.templates).sort()).toEqual(["roadmap", "sprint"]);
		expect(result.problems).toEqual([]);
	});

	it("adds a repo template named after its file, and ignores files that are not JSON templates", async () => {
		const result = await loadTemplates(
			".holocron/projects",
			io({ "bug-bash.json": JSON.stringify(whole), "README.md": "x" })
		);
		expect(Object.keys(result.templates).sort()).toEqual(["bug-bash", "roadmap", "sprint"]);
		expect(result.templates["bug-bash"]?.statuses[0]?.name).toBe("Fixed");
	});

	it("lets a repo template replace a built-in of the same name", async () => {
		const result = await loadTemplates("d", io({ "roadmap.json": JSON.stringify(whole) }));
		expect(result.templates.roadmap?.statuses).toEqual([{ name: "Fixed", category: "done" }]);
	});

	it("extends a built-in, and extends another repo template whatever the file order", async () => {
		const files = {
			"a-child.json": JSON.stringify({ extends: "z-parent", fields: [{ name: "Team", type: "text" }] }),
			"z-parent.json": JSON.stringify({ extends: "roadmap", fields: [{ name: "Area", type: "text" }] }),
		};
		const result = await loadTemplates("d", io(files));
		expect(result.problems).toEqual([]);
		expect(result.templates["a-child"]?.fields.map((f) => f.name)).toEqual([
			"Priority",
			"Milestone",
			"Area",
			"Team",
		]);
	});

	it("reports a bad file by name and still loads the rest", async () => {
		const result = await loadTemplates(
			"d",
			io({
				"broken.json": "{",
				"wrong.json": JSON.stringify({ statuses: "x" }),
				"orphan.json": JSON.stringify({ extends: "nope" }),
				"good.json": JSON.stringify(whole),
			})
		);
		expect(result.templates.good).toBeDefined();
		expect(result.problems).toEqual(
			expect.arrayContaining([
				"broken.json: not valid JSON",
				"wrong.json: statuses must be a list",
				'orphan.json: extends "nope": there is no template with that name',
			])
		);
	});

	it("reports a cycle instead of looping", async () => {
		const result = await loadTemplates(
			"d",
			io({ "a.json": JSON.stringify({ extends: "b" }), "b.json": JSON.stringify({ extends: "a" }) })
		);
		expect(result.problems).toEqual([
			'a.json: extends "b", which never resolves (a cycle)',
			'b.json: extends "a", which never resolves (a cycle)',
		]);
	});
});
