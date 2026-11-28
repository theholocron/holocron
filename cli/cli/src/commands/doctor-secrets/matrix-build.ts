import type { Matrix, MatrixCell, MatrixColumn, MatrixPlace, MatrixRow } from "./doctor-secrets.type.js";

/** Where a group sits among the columns: the vault first, then GitHub, then the deployments. */
function groupRank(group: string): number {
	if (group === "GitHub") return 1;
	if (group === "Deploy") return 2;
	return 0;
}

/**
 * What one place says about one name. A place that could not be read is `?` whatever the name. Otherwise the name is
 * `ok` where it is needed and found, `MISSING` where it is needed and not found, `extra` where it is found and nothing
 * needs it (unless the config lists it as set by hand, which is never reported), and `n/a` where it is neither.
 *
 * @param place - The place.
 * @param upper - The name, upper-cased: names are compared without regard to case, as GitHub does.
 * @param manual - The upper-cased names that are set by hand on purpose.
 */
export function cellFor(place: MatrixPlace, upper: string, manual: ReadonlySet<string>): MatrixCell {
	if (place.unread !== undefined) return "?";
	const needed = place.needed.some((name) => name.toUpperCase() === upper);
	const found = (place.present ?? []).some((name) => name.toUpperCase() === upper);
	if (needed) return found ? "ok" : "MISSING";
	if (found) return manual.has(upper) ? "n/a" : "extra";
	return "n/a";
}

function columnsOf(places: MatrixPlace[]): MatrixColumn[] {
	const seen = new Map<string, MatrixColumn>();
	for (const { column } of places) if (!seen.has(column.id)) seen.set(column.id, column);
	return [...seen.values()]
		.map((column, index) => ({ column, index }))
		.sort((a, b) => groupRank(a.column.group) - groupRank(b.column.group) || a.index - b.index)
		.map(({ column }) => column);
}

function rowsOf(places: MatrixPlace[], columns: MatrixColumn[], manual: ReadonlySet<string>): MatrixRow[] {
	const names = new Map<string, string>();
	for (const place of places) {
		for (const name of [...place.needed, ...(place.present ?? [])]) {
			if (!names.has(name.toUpperCase())) names.set(name.toUpperCase(), name);
		}
	}
	return [...names]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([upper, name]) => {
			const cells: Record<string, MatrixCell> = {};
			for (const column of columns) {
				cells[column.id] = cellFor(
					places.find((p) => p.column.id === column.id)!,
					upper,
					manual
				);
			}
			return { name, cells };
		});
}

/**
 * Builds the matrix from what is known about each place: one row per name, one column per place, in two blocks so a
 * visible value is never mistaken for a concealed one. Names only; no value is ever part of it.
 *
 * @param places - Every place that was looked at, with the names it holds and the names it should hold.
 * @param manual - Names set by hand on purpose (`doctor.manualSecrets`), never reported as `extra`.
 */
export function buildMatrix(places: MatrixPlace[], manual: readonly string[] = []): Matrix {
	const skip = new Set(manual.map((name) => name.toUpperCase()));
	const secretPlaces = places.filter((p) => p.kind === "secret");
	const variablePlaces = places.filter((p) => p.kind === "variable");
	const secret = columnsOf(secretPlaces);
	const variable = columnsOf(variablePlaces);
	return {
		columns: { secret, variable },
		secrets: rowsOf(secretPlaces, secret, skip),
		variables: rowsOf(variablePlaces, variable, skip),
		places,
	};
}
