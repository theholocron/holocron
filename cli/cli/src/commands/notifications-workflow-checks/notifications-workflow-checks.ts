import { describeError, sanitizeDetail } from "@theholocron/kyber/ui";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import { layoutSecretNames } from "../notifications-channel-add/index.js";
import { workflowNameProblems } from "../workflow-name-problems/index.js";
import type { NotificationsWorkflowChecksInput } from "./notifications-workflow-checks.type.js";

/** Where the workflow that posts failed runs and releases lives, on the default branch. */
export const NOTIFICATIONS_WORKFLOW_PATH = ".github/workflows/platform.notifications.yml";

/** The webhook secrets the workflow posts through: failed runs, deploys and releases. */
const WEBHOOK_SECRETS = [
	"HOLOCRON_NOTIFY_WEBHOOK_ALERTS",
	"HOLOCRON_NOTIFY_WEBHOOK_DEPLOYS",
	"HOLOCRON_NOTIFY_WEBHOOK_RELEASES",
];

const PRESENT_ID = "notifications-workflow";
const PRESENT_TITLE = "Notifications workflow is on the default branch";
const WIRED_ID = "notifications-workflow-wiring";
const WIRED_TITLE = "Notifications workflow posts through the layout's webhooks";
const NAMES_ID = "notifications-workflow-names";
const NAMES_TITLE = "Notifications workflow lists only task ids";

const shown = (s: string) => sanitizeDetail(s);
const upper = (names: string[]) => new Set(names.map((n) => n.toUpperCase()));

/**
 * The steps of `doctor notifications` that check the workflow which posts failed runs and releases: the file is on
 * the default branch, and the `HOLOCRON_NOTIFY_*` secrets it reads are the ones the layout fills (so every channel it
 * writes to is in the layout, and a channel the layout wires for it is one it posts to). Read-only. No rows when the
 * layout fills none of the alerts, deploys or releases webhooks, because then nothing is meant to reach those channels.
 */
export async function notificationsWorkflowChecks(
	input: NotificationsWorkflowChecksInput
): Promise<NotificationsCheck[]> {
	const filled = upper(layoutSecretNames(input.layout));
	const wired = WEBHOOK_SECRETS.filter((name) => filled.has(name));
	if (wired.length === 0) return [];

	const { source } = input;
	if (!source?.readFile) {
		const reason = source
			? `the \`${source.providerName}\` provider cannot read a file`
			: input.sourceMissingReason;
		return [
			skipRow(PRESENT_ID, PRESENT_TITLE, reason),
			skipRow(WIRED_ID, WIRED_TITLE, "not checked: the workflow could not be read"),
			skipRow(NAMES_ID, NAMES_TITLE, "not checked: the workflow could not be read"),
		];
	}

	let text: string | undefined;
	try {
		text = (await source.readFile(NOTIFICATIONS_WORKFLOW_PATH))?.content;
	} catch (err) {
		const reason = shown(describeError(err));
		return [
			{ id: PRESENT_ID, title: PRESENT_TITLE, status: "fail", detail: reason, problems: [] },
			skipRow(WIRED_ID, WIRED_TITLE, "not checked: the workflow could not be read"),
			skipRow(NAMES_ID, NAMES_TITLE, "not checked: the workflow could not be read"),
		];
	}
	if (text === undefined) {
		return [
			resultRow(
				PRESENT_ID,
				PRESENT_TITLE,
				[
					`${NOTIFICATIONS_WORKFLOW_PATH} is missing: without it a failed run or a release posts nothing to Discord`,
				],
				""
			),
			skipRow(WIRED_ID, WIRED_TITLE, "not checked: the workflow is missing"),
			skipRow(NAMES_ID, NAMES_TITLE, "not checked: the workflow is missing"),
		];
	}

	const read = [...text.matchAll(/secrets\.(HOLOCRON_NOTIFY_[A-Z0-9_]+)/g)].map((m) => m[1]!);
	const readSet = upper(read);
	const problems = [
		...[...new Set(read)]
			.filter((name) => !filled.has(name.toUpperCase()))
			.map((name) => `${shown(name)}: the workflow reads it but the layout fills no such secret`),
		...wired
			.filter((name) => !readSet.has(name))
			.map((name) => `${name}: the layout fills it but the workflow never posts through it`),
	];
	return [
		resultRow(PRESENT_ID, PRESENT_TITLE, [], "found"),
		resultRow(WIRED_ID, WIRED_TITLE, problems, `${wired.length} of ${wired.length} wired`),
		resultRow(NAMES_ID, NAMES_TITLE, workflowNameProblems(text), "task ids"),
	];
}
