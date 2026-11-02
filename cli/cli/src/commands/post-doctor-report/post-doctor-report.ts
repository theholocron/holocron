import type { Notifications } from "../../plugin/index.js";
import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
import type { DoctorNotificationsReport } from "../doctor-notifications/doctor-notifications.type.js";
import { formatDoctorPost } from "../format-doctor-post/index.js";

/**
 * Posts a `doctor notifications` result to a channel and returns the line to print about it. Never throws: a post
 * that could not be made is reported and leaves the check's own result, and so its exit code, as it was.
 */
export async function postDoctorReport(
	notifications: Notifications,
	channel: string,
	report: Pick<DoctorNotificationsReport, "checks" | "summary">
): Promise<string> {
	if (!notifications.postMessage) {
		return `not posted: the \`${notifications.providerName}\` provider cannot post a message as the bot`;
	}
	try {
		await notifications.postMessage(channel, formatDoctorPost(report));
		return `posted to #${sanitizeDetail(channel)}`;
	} catch (err) {
		return `not posted: ${sanitizeDetail(describeProviderError(err))}`;
	}
}
