import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";

/** A step that could not be tried: the reason is the detail, and it is not a failure. */
export function skipRow(id: string, title: string, reason: string): NotificationsCheck {
	return { id, title, status: "skip", detail: reason, problems: [] };
}

/** A step that held when it has no problems, and failed with one line per problem when it has. */
export function resultRow(id: string, title: string, problems: string[], ok: string): NotificationsCheck {
	return {
		id,
		title,
		status: problems.length === 0 ? "pass" : "fail",
		detail: problems.length === 0 ? ok : `${problems.length} problem(s)`,
		problems,
	};
}
