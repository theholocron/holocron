import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATES_DIR, resolveProjectOptions } from "./index.js";

describe("resolveProjectOptions", () => {
	it("fills in the owner from the config's org and the default directory when there are no options", () => {
		expect(resolveProjectOptions({}, "theholocron")).toEqual({
			ok: true,
			options: { owner: "theholocron", boards: [], templatesDir: DEFAULT_TEMPLATES_DIR },
		});
	});

	it("reads the org, the boards and the directory", () => {
		const result = resolveProjectOptions(
			{ org: "other", templates: "boards", boards: [{ template: "roadmap", name: "v5" }] },
			"theholocron"
		);
		expect(result).toEqual({
			ok: true,
			options: { owner: "other", boards: [{ template: "roadmap", name: "v5" }], templatesDir: "boards" },
		});
	});

	it("lists every problem at once", () => {
		const result = resolveProjectOptions(
			{
				org: 3,
				templates: "",
				boards: [{ template: "roadmap" }, "v5", { template: "a", name: "x" }, { template: "b", name: "x" }],
			},
			"theholocron"
		);
		expect(result).toEqual({
			ok: false,
			problems: [
				"org must be text",
				"templates must be the path of a directory",
				"boards[0] needs a name",
				"boards[1] must be { template, name }",
				'boards[3]: the board name "x" is used twice',
			],
		});
	});

	it("says boards must be a list", () => {
		expect(resolveProjectOptions({ boards: { template: "roadmap", name: "v5" } }, "o")).toEqual({
			ok: false,
			problems: ["boards must be a list of { template, name }"],
		});
	});
});
