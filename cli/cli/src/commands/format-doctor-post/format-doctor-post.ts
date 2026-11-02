import { sanitizeDetail } from "../../ui/provider-error/index.js";
import type { DoctorNotificationsReport } from "../doctor-notifications/doctor-notifications.type.js";

/** The longest message Discord accepts, less room for the cut-off note. */
const LIMIT = 1900;

/**
 * The message `doctor notifications --post` sends: the one-line summary when every step held, and each failing step
 * with its problems when one did not. Built from the report, never from printed output, and flattened and capped
 * line by line like the terminal's own rows.
 */
export function formatDoctorPost(report: Pick<DoctorNotificationsReport, "checks" | "summary">): string {
	const { pass, fail, skip } = report.summary;
	const counts = `${pass} ok, ${fail} fail, ${skip} skipped`;
	if (fail === 0) return `✅ holocron doctor notifications: ${counts}`;
	const lines = [`❌ holocron doctor notifications: ${counts}`];
	for (const check of report.checks.filter((c) => c.status === "fail")) {
		lines.push(`• ${sanitizeDetail(check.title)} — ${sanitizeDetail(check.detail)}`);
		for (const problem of check.problems) lines.push(`  – ${sanitizeDetail(problem)}`);
	}
	const text = lines.join("\n");
	return text.length > LIMIT ? `${text.slice(0, LIMIT)}\n…` : text;
}
