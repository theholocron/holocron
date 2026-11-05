import { describe, expect, it } from "vitest";

import { BUILTIN_TEMPLATES } from "../builtin-templates/index.js";
import { resolveTemplate } from "./resolve-template.js";

describe("resolveTemplate", () => {
	it("returns a whole file as a template named after the file when it names nothing", () => {
		const result = resolveTemplate(
			"bug-bash",
			{
				statuses: [{ name: "Fixed", category: "done" }],
				fields: [],
				views: [{ name: "All", layout: "table" }],
			},
			BUILTIN_TEMPLATES
		);
		expect(result).toMatchObject({ ok: true, template: { name: "bug-bash", fields: [] } });
	});

	it("prefers the name the file gives", () => {
		const result = resolveTemplate(
			"file-name",
			{ name: "own", statuses: [], fields: [], views: [] },
			BUILTIN_TEMPLATES
		);
		expect(result).toMatchObject({ ok: true, template: { name: "own" } });
	});

	it("extends a built-in: keeps what it has, adds the new field, and replaces a status that repeats a name", () => {
		const result = resolveTemplate(
			"team-roadmap",
			{
				extends: "roadmap",
				fields: [{ name: "Team", type: "single_select", options: ["CLI", "Infra"] }],
				statuses: [{ name: "Blocked", category: "blocked", color: "ORANGE" }],
				rules: ["Item closed"],
			},
			BUILTIN_TEMPLATES
		);
		expect(result.ok).toBe(true);
		const template = (result as { template: (typeof BUILTIN_TEMPLATES)["roadmap"] }).template;
		expect(template.name).toBe("team-roadmap");
		expect(template.fields.map((f) => f.name)).toEqual(["Priority", "Milestone", "Team"]);
		expect(template.statuses.map((s) => s.name)).toEqual(["Someday", "Todo", "In Progress", "Blocked", "Done"]);
		expect(template.statuses.find((s) => s.name === "Blocked")?.color).toBe("ORANGE");
		expect(template.rules).toEqual(["Auto-add sub-issues to project", "Item closed"]);
		expect(template.views).toEqual(BUILTIN_TEMPLATES.roadmap?.views);
	});

	it("keeps the source it extends, unless the file names its own", () => {
		const base = { base: { ...BUILTIN_TEMPLATES.roadmap!, name: "base", source: "v5" } };
		expect(resolveTemplate("a", { extends: "base" }, base)).toMatchObject({ ok: true, template: { source: "v5" } });
		expect(resolveTemplate("a", { extends: "base", source: "v6" }, base)).toMatchObject({
			ok: true,
			template: { source: "v6" },
		});
	});

	it("takes only the file's rules when the template it extends has none", () => {
		const base = { base: { ...BUILTIN_TEMPLATES.roadmap!, name: "base", rules: undefined } };
		expect(resolveTemplate("a", { extends: "base", rules: ["Item closed"] }, base)).toMatchObject({
			ok: true,
			template: { rules: ["Item closed"] },
		});
		expect(resolveTemplate("a", { extends: "base" }, base)).toMatchObject({ ok: true, template: { rules: [] } });
	});

	it("says which template is missing", () => {
		expect(resolveTemplate("a", { extends: "nope" }, BUILTIN_TEMPLATES)).toEqual({
			ok: false,
			problems: ['extends "nope": there is no template with that name'],
		});
	});

	it("refuses a template that extends itself", () => {
		expect(resolveTemplate("roadmap", { extends: "roadmap" }, BUILTIN_TEMPLATES)).toEqual({
			ok: false,
			problems: ['"roadmap" cannot extend itself'],
		});
	});

	it("refuses a file that neither extends nor lists everything", () => {
		expect(resolveTemplate("a", { statuses: [] }, BUILTIN_TEMPLATES)).toEqual({
			ok: false,
			problems: ["a template without extends must list its statuses, fields and views"],
		});
	});

	it("extends a template that declares no rules", () => {
		const plain = { name: "plain", statuses: [], fields: [], views: [] };
		const result = resolveTemplate("mine", { extends: "plain", rules: ["auto-close"] }, { plain });
		expect(result).toMatchObject({ ok: true, template: { name: "mine", rules: ["auto-close"] } });
	});
});
