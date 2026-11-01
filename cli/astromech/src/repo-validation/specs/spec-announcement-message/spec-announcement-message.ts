import type { SpecAnnouncement, SpecPullRequest } from "../specs.type.js";

/** One announcement as a line of the post. */
function line(a: SpecAnnouncement): string {
	const status = a.status === undefined ? "" : ` (${a.status})`;
	switch (a.kind) {
		case "new":
			return `💡 New spec: **${a.title}**${status}`;
		case "edited":
			return `📝 Spec updated: **${a.title}**${status}`;
		case "status":
			return `🔀 Spec status: **${a.title}**, ${a.previousStatus ?? "no status"} → ${a.status ?? "no status"}`;
		case "merged":
			return `✅ Spec merged: **${a.title}**${status}`;
	}
}

/**
 * The post for one pull request event: a line for each announced spec, then the pull request, whose address is kept
 * in angle brackets so Discord does not expand it into a preview card. One post per event, however many specs the
 * pull request touches.
 */
export function specAnnouncementMessage(announcements: readonly SpecAnnouncement[], pr: SpecPullRequest): string {
	return [...announcements.map(line), `Pull request #${pr.number}: <${pr.url}>`].join("\n");
}
