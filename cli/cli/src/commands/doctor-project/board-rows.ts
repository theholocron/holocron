import type { BoardField, BoardState, BoardTemplate, BoardView } from "../../plugin/index.js";
import type { CheckRow } from "../doctor-checks/index.js";

/** A row that is information only: it never fails the run and counts as skipped. */
const info = (id: string, title: string, noun: string, extras: string[]): CheckRow => ({
	id,
	title,
	status: "skip",
	detail: `info: ${extras.length} ${noun} not in the template (never deleted)`,
	problems: extras,
});

const row = (id: string, title: string, problems: string[], ok: string): CheckRow => ({
	id,
	title,
	status: problems.length > 0 ? "fail" : "ok",
	detail: problems.length > 0 ? `${problems.length} problem(s)` : ok,
	problems,
});

/** The problems with an ordered list: what is missing, and, when nothing is, whether the declared ones are in order. */
function listProblems(noun: string, plural: string, declared: string[], actual: string[]): string[] {
	const problems = declared.filter((d) => !actual.includes(d)).map((d) => `missing ${noun} ${d}`);
	if (problems.length > 0) return problems;
	const present = actual.filter((a) => declared.includes(a));
	return present.some((a, i) => a !== declared[i])
		? [`${plural} are in the order ${present.join(", ")}, declared ${declared.join(", ")}`]
		: [];
}

function fieldProblems(want: BoardField, found: BoardField | undefined): string[] {
	if (!found) return [`missing field ${want.name}`];
	const problems: string[] = [];
	if (found.type !== want.type) problems.push(`type is ${found.type}, declared ${want.type}`);
	if (want.options) problems.push(...listProblems("option", "options", want.options, found.options ?? []));
	return problems;
}

function viewProblems(want: BoardView, found: BoardView | undefined): string[] {
	if (!found) return [`missing view ${want.name}`];
	const problems: string[] = [];
	if (found.layout !== want.layout) problems.push(`layout is ${found.layout}, declared ${want.layout}`);
	if (want.filter !== undefined && found.filter !== want.filter) {
		problems.push(`filter is ${found.filter ?? "none"}, declared ${want.filter}`);
	}
	return problems;
}

/**
 * The rows that compare a declared board's template with the live board, in the order the spec lists them: the
 * statuses (in order), each field with its options (in order), each view with its layout and filter, each automation
 * rule. What the board has beyond the template is an `info` row and never a failure.
 */
export function boardRows(boardName: string, template: BoardTemplate, state: BoardState): CheckRow[] {
	const id = `project:${boardName}`;
	const rows: CheckRow[] = [];

	rows.push(
		row(
			`${id}:statuses`,
			`${boardName}: statuses`,
			listProblems(
				"status",
				"statuses",
				template.statuses.map((s) => s.name),
				state.statuses
			),
			`${template.statuses.length} in order`
		)
	);
	const extraStatuses = state.statuses.filter((s) => !template.statuses.some((t) => t.name === s));
	if (extraStatuses.length > 0)
		rows.push(info(`${id}:extra-statuses`, `${boardName}: extra statuses`, "status(es)", extraStatuses));

	for (const want of template.fields) {
		rows.push(
			row(
				`${id}:field:${want.name}`,
				`${boardName}: field ${want.name}`,
				fieldProblems(
					want,
					state.fields.find((f) => f.name === want.name)
				),
				want.options ? `${want.options.length} options in order` : want.type
			)
		);
	}
	const extraFields = state.fields.filter((f) => !template.fields.some((t) => t.name === f.name));
	if (extraFields.length > 0) {
		rows.push(
			info(
				`${id}:extra-fields`,
				`${boardName}: extra fields`,
				"field(s)",
				extraFields.map((f) => f.name)
			)
		);
	}

	for (const want of template.views) {
		rows.push(
			row(
				`${id}:view:${want.name}`,
				`${boardName}: view ${want.name}`,
				viewProblems(
					want,
					state.views.find((v) => v.name === want.name)
				),
				`${want.layout}${want.filter ? `, ${want.filter}` : ""}`
			)
		);
	}
	const extraViews = state.views.filter((v) => !template.views.some((t) => t.name === v.name));
	if (extraViews.length > 0) {
		rows.push(
			info(
				`${id}:extra-views`,
				`${boardName}: extra views`,
				"view(s)",
				extraViews.map((v) => v.name)
			)
		);
	}

	for (const name of template.rules ?? []) {
		const found = state.rules.find((r) => r.name === name);
		const problems = !found ? [`missing rule ${name}`] : found.enabled ? [] : [`rule ${name} is off`];
		rows.push(row(`${id}:rule:${name}`, `${boardName}: rule ${name}`, problems, "on"));
	}
	return rows;
}
