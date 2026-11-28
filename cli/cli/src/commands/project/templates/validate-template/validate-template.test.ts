import { describe, expect, it } from "vitest";

import { validateTemplateFile } from "./validate-template.js";

const whole = {
	statuses: [
		{ name: "Todo", category: "planned" },
		{ name: "Done", category: "done" },
	],
	fields: [{ name: "Priority", type: "single_select", options: ["Now", "Next"] }],
	views: [{ name: "Active", layout: "table", filter: "-status:Done" }],
};

describe("validateTemplateFile", () => {
	it("accepts a whole template", () => {
		expect(validateTemplateFile(whole)).toMatchObject({ ok: true });
	});

	it("accepts a template that only extends another and adds to it", () => {
		expect(validateTemplateFile({ extends: "roadmap", fields: [{ name: "Team", type: "text" }] })).toMatchObject({
			ok: true,
		});
	});

	it("rejects a value that is not an object", () => {
		expect(validateTemplateFile([])).toEqual({ ok: false, problems: ["a template must be an object"] });
		expect(validateTemplateFile(null)).toEqual({ ok: false, problems: ["a template must be an object"] });
	});

	it("lists every problem at once, not the first", () => {
		const result = validateTemplateFile({
			name: 3,
			extends: "",
			source: 1,
			rules: [1],
			statuses: [
				{ name: "Todo", category: "later" },
				{ category: "done" },
				{ name: "Todo", category: "done" },
				5,
			],
			fields: [{ name: "P", type: "dial" }],
			views: [{ name: "V", layout: "grid" }],
		});
		expect(result.ok).toBe(false);
		const problems = (result as { problems: string[] }).problems;
		expect(problems).toEqual(
			expect.arrayContaining([
				"name must be text",
				"extends must be the name of a template",
				"source must be the name of a board",
				"rules must be a list of rule names",
				expect.stringContaining("statuses[0] needs a category"),
				"statuses[1] needs a name",
				'statuses[2]: the name "Todo" is used twice',
				"statuses[3] must be an object",
				expect.stringContaining("fields[0] needs a type"),
				expect.stringContaining("views[0] needs a layout"),
			])
		);
	});

	it("needs options on a single_select and refuses them on anything else", () => {
		const select = validateTemplateFile({ ...whole, fields: [{ name: "P", type: "single_select" }] });
		expect((select as { problems: string[] }).problems).toEqual([
			"fields[0] is a single_select and needs a list of options",
		]);
		const text = validateTemplateFile({ ...whole, fields: [{ name: "P", type: "text", options: ["a"] }] });
		expect((text as { problems: string[] }).problems).toEqual(["fields[0] has options but is not a single_select"]);
	});

	it("needs a statuses, fields and views list, and a done status, when it does not extend", () => {
		const empty = validateTemplateFile({});
		expect((empty as { problems: string[] }).problems).toEqual([
			"a template without extends must list its statuses",
			"a template without extends must list its fields (an empty list is fine)",
			"a template without extends must list its views",
		]);
		const noDone = validateTemplateFile({ ...whole, statuses: [{ name: "Todo", category: "planned" }] });
		expect((noDone as { problems: string[] }).problems).toEqual(["statuses need one in the done category"]);
	});

	it("says a list is not a list", () => {
		const result = validateTemplateFile({ extends: "roadmap", statuses: "Todo", fields: {}, views: 1 });
		expect((result as { problems: string[] }).problems).toEqual([
			"statuses must be a list",
			"fields must be a list",
			"views must be a list",
		]);
	});
});
