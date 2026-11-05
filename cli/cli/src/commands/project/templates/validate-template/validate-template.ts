import type { BoardTemplateFile } from "../../../../plugin/index.js";
import type { ValidateTemplateResult } from "./validate-template.type.js";

const CATEGORIES = ["backlog", "planned", "active", "blocked", "done"];
const FIELD_TYPES = ["single_select", "text", "number", "date", "iteration"];
const LAYOUTS = ["board", "table"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/** Problems with a list of named entries: not an array, not an object, no name, or a name used twice. */
function namedList(
	label: string,
	value: unknown,
	check: (entry: Record<string, unknown>, where: string) => string[]
): string[] {
	if (!Array.isArray(value)) return [`${label} must be a list`];
	const problems: string[] = [];
	const seen = new Set<string>();
	value.forEach((entry, i) => {
		const where = `${label}[${i}]`;
		if (!isRecord(entry)) {
			problems.push(`${where} must be an object`);
			return;
		}
		if (!isText(entry.name)) {
			problems.push(`${where} needs a name`);
		} else if (seen.has(entry.name)) {
			problems.push(`${where}: the name "${entry.name}" is used twice`);
		} else {
			seen.add(entry.name);
		}
		problems.push(...check(entry, where));
	});
	return problems;
}

/**
 * Check what a template file holds, without reading any file: the shape of the statuses, fields, views and rules, a
 * name used twice, a category or layout that does not exist. With no `extends` it must also hold a whole template (a
 * status, the fields and the views). Returns the file typed, or every problem found, so one run lists them all.
 */
export function validateTemplateFile(value: unknown): ValidateTemplateResult {
	if (!isRecord(value)) return { ok: false, problems: ["a template must be an object"] };
	const problems: string[] = [];

	if (value.name !== undefined && !isText(value.name)) problems.push("name must be text");
	if (value.extends !== undefined && !isText(value.extends)) problems.push("extends must be the name of a template");
	if (value.source !== undefined && !isText(value.source)) problems.push("source must be the name of a board");
	if (value.rules !== undefined && !(Array.isArray(value.rules) && value.rules.every(isText))) {
		problems.push("rules must be a list of rule names");
	}

	if (value.statuses !== undefined) {
		problems.push(
			...namedList("statuses", value.statuses, (s, where) =>
				typeof s.category === "string" && CATEGORIES.includes(s.category)
					? []
					: [`${where} needs a category: ${CATEGORIES.join(", ")}`]
			)
		);
	}
	if (value.fields !== undefined) {
		problems.push(
			...namedList("fields", value.fields, (f, where) => {
				if (typeof f.type !== "string" || !FIELD_TYPES.includes(f.type)) {
					return [`${where} needs a type: ${FIELD_TYPES.join(", ")}`];
				}
				const options = f.options;
				if (f.type === "single_select") {
					return Array.isArray(options) && options.length > 0 && options.every(isText)
						? []
						: [`${where} is a single_select and needs a list of options`];
				}
				return options === undefined ? [] : [`${where} has options but is not a single_select`];
			})
		);
	}
	if (value.views !== undefined) {
		problems.push(
			...namedList("views", value.views, (v, where) =>
				typeof v.layout === "string" && LAYOUTS.includes(v.layout)
					? []
					: [`${where} needs a layout: ${LAYOUTS.join(", ")}`]
			)
		);
	}

	if (value.extends === undefined) {
		if (!Array.isArray(value.statuses) || value.statuses.length === 0) {
			problems.push("a template without extends must list its statuses");
		} else if (!value.statuses.some((s) => isRecord(s) && s.category === "done")) {
			problems.push("statuses need one in the done category");
		}
		if (value.fields === undefined)
			problems.push("a template without extends must list its fields (an empty list is fine)");
		if (!Array.isArray(value.views) || value.views.length === 0)
			problems.push("a template without extends must list its views");
	}

	return problems.length > 0 ? { ok: false, problems } : { ok: true, file: value as BoardTemplateFile };
}
