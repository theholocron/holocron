import { sanitizeDetail } from "../../ui/provider-error/index.js";
import type { DoctorNotificationsReport } from "../doctor-notifications/doctor-notifications.type.js";

/** The longest message Discord accepts, less room for the cut-off note. */
const LIMIT = 1900;

/**
 * The message `doctor notifications --post` sends, in Discord's markdown: a heading, the counts, and, when a step
 * failed, each failing step in bold with its problems as a list. A clean run is only the heading and the counts.
 * Built from the report, never from printed output, and flattened and capped line by line like the terminal's own
 * rows. `name` is the deep check the post is about (default `notifications`). A `#channel` in a problem is turned into a link by the provider that posts it.
 */
export function formatDoctorPost(
	report: Pick<DoctorNotificationsReport, "checks" | "summary">,
	name = "notifications"
): string {
	const { pass, fail, skip } = report.summary;
	const lines = [
		`### ${fail === 0 ? "✅" : "❌"} \`holocron doctor ${name}\``,
		`**${pass}** ok · **${fail}** fail · **${skip}** skipped`,
	];
	for (const check of report.checks.filter((c) => c.status === "fail")) {
		lines.push("", `**${sanitizeDetail(check.title)}** — ${sanitizeDetail(check.detail)}`);
		for (const problem of check.problems) lines.push(`- ${sanitizeDetail(problem)}`);
	}
	const text = lines.join("\n");
	return text.length > LIMIT ? `${text.slice(0, LIMIT)}\n…` : text;
}
