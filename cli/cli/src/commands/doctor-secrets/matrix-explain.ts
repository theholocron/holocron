import type { Matrix } from "./doctor-secrets.type.js";
import { cellFor } from "./matrix-build.js";

/**
 * The `--name` lookup: for one name, how each place stands and why, for example `ok, synced to repository secrets by
 * the third entry` or `extra, found here but no entry feeds it`. Informational only. Names only; no value is read.
 *
 * @param matrix - The matrix.
 * @param name - The name, compared without regard to case.
 * @param manual - Names set by hand on purpose (`doctor.manualSecrets`).
 * @returns One line per place that knows the name or could not be read, or one line saying nothing knows it.
 */
export function explainName(matrix: Matrix, name: string, manual: readonly string[]): string[] {
	const upper = name.toUpperCase();
	const skip = new Set(manual.map((entry) => entry.toUpperCase()));
	const lines: string[] = [];
	for (const place of matrix.places) {
		const where = `${place.column.group} ${place.column.label} (${place.kind}s)`;
		const cell = cellFor(place, upper, skip);
		const found = (place.present ?? []).some((entry) => entry.toUpperCase() === upper);
		// A place that neither holds nor needs the name has nothing to say, unless it could not be read.
		if (cell === "n/a" && !(skip.has(upper) && found)) continue;
		const why =
			cell === "?"
				? `could not read it: ${place.unread}`
				: cell === "extra"
					? "found here, but no entry feeds it"
					: cell === "n/a"
						? "set by hand on purpose (doctor.manualSecrets)"
						: (place.reasons?.[upper] ?? "needed by the config");
		lines.push(`${where}: ${cell}, ${why}`);
	}
	return lines.length > 0 ? lines : [`${name}: no place the config declares or reads holds or needs this name`];
}
