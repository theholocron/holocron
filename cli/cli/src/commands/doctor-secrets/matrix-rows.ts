import type { CheckRow } from "@theholocron/kyber/ui";

import type { Matrix, MatrixCell, MatrixPlace } from "./doctor-secrets.type.js";
import { cellFor } from "./matrix-build.js";

const where = (place: MatrixPlace): string => `${place.column.group} ${place.column.label}`;

function namesWith(place: MatrixPlace, cell: MatrixCell, manual: ReadonlySet<string>): string[] {
	const names = new Map<string, string>();
	for (const name of [...place.needed, ...(place.present ?? [])]) names.set(name.toUpperCase(), name);
	return [...names]
		.filter(([upper]) => cellFor(place, upper, manual) === cell)
		.map(([, name]) => name)
		.sort();
}

/**
 * The rows the matrix adds to `doctor secrets`, from the places it was built from:
 *
 * - `extra` names are in the matrix and make no row, except with `strict`, where each place that has some fails.
 * - `MISSING` names fail, one row per place, except in a place another check already reports on (GitHub).
 * - A place that could not be read is a skipped row that names it and why, again except where another check says so.
 *
 * @param matrix - The matrix.
 * @param manual - Names set by hand on purpose (`doctor.manualSecrets`).
 * @param strict - Whether an `extra` name is a failure.
 */
export function matrixRows(matrix: Matrix, manual: readonly string[], strict: boolean): CheckRow[] {
	const skip = new Set(manual.map((name) => name.toUpperCase()));
	const rows: CheckRow[] = [];
	for (const place of matrix.places) {
		const id = `${place.kind}:${place.column.id}`;
		const title = `${where(place)} ${place.kind}s`;
		if (place.unread !== undefined) {
			if (!place.column.reportedElsewhere && !place.column.unreadReported) {
				rows.push({
					id: `unread:${id}`,
					title,
					status: "skip",
					detail: `could not read ${where(place)}: ${place.unread}`,
					problems: [],
				});
			}
			continue;
		}
		const missing = place.column.reportedElsewhere ? [] : namesWith(place, "MISSING", skip);
		if (missing.length > 0) {
			rows.push({
				id: `missing:${id}`,
				title,
				status: "fail",
				detail: `${missing.length} problem(s)`,
				problems: missing.map((name) => `missing ${place.kind} ${name}`),
			});
		}
		// The matrix already shows an `extra` name; it is a row only with `--strict`, where it fails the run.
		const extra = strict ? namesWith(place, "extra", skip) : [];
		if (extra.length > 0) {
			rows.push({
				id: `extra:${id}`,
				title,
				status: "fail",
				detail: `${extra.length} extra in ${where(place)}, nothing feeds ${extra.length === 1 ? "it" : "them"}: ${extra.join(", ")}`,
				problems: [],
			});
		}
	}
	return rows;
}
