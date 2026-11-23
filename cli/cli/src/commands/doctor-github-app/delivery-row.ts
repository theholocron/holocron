import type { GitHubAppCredentials } from "@theholocron/github-client";
import type { CheckRow } from "@theholocron/kyber/ui";

import { failedDeliveries } from "../webhook-deliveries/index.js";
import type { GitHubAppApi } from "./doctor-github-app.type.js";
import { scrubbed } from "./read-app-credentials.js";

const DAY_MS = 24 * 60 * 60_000;

/** The most failed deliveries a row names; the rest are counted. */
const MAX_NAMED = 10;

/**
 * The `deliveries` row of one App instance (SPEC-0099, signal 3): how many webhook deliveries in the last day failed and
 * have not been delivered again successfully. A failing row names the oldest ones and ends with the command that repairs
 * them. A delivery log that cannot be read (an API without the call, a refusal) is a skip with the reason, never a failure
 * of the check.
 */
export async function deliveryRow(
	name: string,
	creds: GitHubAppCredentials,
	api: GitHubAppApi,
	now: number,
	secrets: string[]
): Promise<CheckRow> {
	const id = `${name}:deliveries`;
	const title = `${name}: deliveries`;
	if (!api.listAppDeliveries) {
		return { id, title, status: "skip", detail: "the delivery log is not read here", problems: [] };
	}
	let failed;
	try {
		failed = failedDeliveries(await api.listAppDeliveries(creds, { since: new Date(now - DAY_MS).toISOString() }));
	} catch (err) {
		return {
			id,
			title,
			status: "skip",
			detail: `cannot read the delivery log: ${scrubbed(err, secrets)}`,
			problems: [],
		};
	}
	if (failed.length === 0) {
		return { id, title, status: "ok", detail: "no failed webhook deliveries in the last day", problems: [] };
	}
	const named = failed.slice(0, MAX_NAMED).map((d) => {
		const what = d.action === null ? d.event : `${d.event}.${d.action}`;
		return `${what}, ${d.status || `status ${d.statusCode}`}, ${d.deliveredAt}`;
	});
	const more = failed.length > MAX_NAMED ? [`and ${failed.length - MAX_NAMED} more`] : [];
	return {
		id,
		title,
		status: "fail",
		detail: `${failed.length} failed webhook deliver${failed.length === 1 ? "y" : "ies"} in the last day; repair with \`holocron redeliver webhooks --app ${name}\``,
		problems: [...named, ...more],
	};
}
