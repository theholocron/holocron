import { sanitizeDetail } from "@theholocron/kyber/ui";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import type { BotPermissionChecksInput } from "./bot-permission-checks.type.js";

const TITLE = "bot holds the server-wide permissions it needs";

/**
 * The step of `doctor notifications` for the bot's own role: the permissions the provider says it needs (read from
 * `inspect`, server-wide, before any channel overwrite) are all held. A failure names the missing ones and carries the
 * link that invites the bot again asking for them, which updates its role in place. Read-only. No row when the provider
 * reports nothing about its bot; a skip when the server or the bot's roles could not be read.
 */
export function botPermissionChecks(input: BotPermissionChecksInput): NotificationsCheck[] {
	const { found } = input;
	if (!found) return [skipRow("bot-permissions", TITLE, "not checked: could not read the server")];
	if (found.botPermissionsError) {
		return [
			skipRow(
				"bot-permissions",
				TITLE,
				`not checked: could not read the bot's roles (${sanitizeDetail(found.botPermissionsError)})`
			),
		];
	}
	const { botPermissions } = found;
	if (!botPermissions) return [];
	const { missing, inviteUrl } = botPermissions;
	const problems =
		missing.length === 0
			? []
			: [
					`missing: ${missing.map((m) => sanitizeDetail(m)).join(", ")}`,
					...(inviteUrl ? [`invite the bot again with them (updates its role in place): ${inviteUrl}`] : []),
				];
	return [resultRow("bot-permissions", TITLE, problems, "every permission it needs")];
}
