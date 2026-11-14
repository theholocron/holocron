import type { CheckRow } from "@theholocron/kyber/ui";

import type { ProbeRow } from "../../plugin/index.js";

/**
 * Folds what one token probe reported into the one row the doctor shows for that token in that layer. A failing probe row
 * (a permission it must not have, one it lacks, a token past its age or near expiry, a probe that threw) fails the row and
 * is listed as a problem; `info` rows are counted and never fail. The probe's rows are already scrubbed by `runProbe`.
 *
 * @param id - The row id.
 * @param title - The row title.
 * @param rows - The rows the probe reported, headings included.
 */
export function summariseProbeRows(id: string, title: string, rows: readonly ProbeRow[]): CheckRow {
	const checks = rows.filter((r) => r.status !== "heading");
	const failed = checks.filter((r) => r.status === "fail");
	const passed = checks.filter((r) => r.status === "ok");
	const noted = checks.filter((r) => r.status === "info");
	if (failed.length > 0) {
		return {
			id,
			title,
			status: "fail",
			detail: `${failed.length} of ${passed.length + failed.length} checks failed`,
			problems: failed.map((r) => (r.detail ? `${r.label}: ${r.detail}` : r.label)),
		};
	}
	if (passed.length === 0) {
		return { id, title, status: "skip", detail: "the probe reported no check to compare", problems: [] };
	}
	const note = noted.length > 0 ? `, ${noted.length} noted` : "";
	return {
		id,
		title,
		status: "ok",
		detail: `${passed.length} ${passed.length === 1 ? "check" : "checks"} passed${note}`,
		problems: [],
	};
}
