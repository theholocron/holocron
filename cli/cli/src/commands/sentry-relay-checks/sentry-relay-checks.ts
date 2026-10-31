import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { missingTokenReason } from "../missing-token/index.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import { DEFAULT_RELAY_INTEGRATION, DEFAULT_RELAY_RULE, wantsRelay } from "../notifications-setup/relay.js";
import type { SentryRelayChecksInput } from "./sentry-relay-checks.type.js";

const INTEGRATION_ID = "relay-integration";
const INTEGRATION_TITLE = "error tracker integration posts to the relay";
const RULE_ID = "relay-rule";
const RULE_TITLE = "error tracker alert rule is on and sends through the integration";

const shown = (s: string) => sanitizeDetail(s);
const bare = (url: string) => url.replace(/\/+$/, "");

/**
 * The steps of `doctor notifications` that check the error tracker's side of the relay: the integration exists, posts
 * to the relay Worker and is offered as an alert action, and the alert rule is on each project, enabled and sending
 * through the integration. Read-only, and the integration's signing secret is never read. No rows unless the layout
 * declares `relay.errors`, which is what `notifications setup` acts on.
 */
export async function sentryRelayChecks(input: SentryRelayChecksInput): Promise<NotificationsCheck[]> {
	const { layout, errors } = input;
	const tracker = layout.relay?.errors;
	if (!tracker || !wantsRelay(layout)) return [];
	const skipBoth = (reason: string) => [
		skipRow(INTEGRATION_ID, INTEGRATION_TITLE, reason),
		skipRow(RULE_ID, RULE_TITLE, reason),
	];
	if (!errors) return skipBoth(input.errorsMissingReason);
	if (!errors.inspectRelay) return skipBoth(`the \`${errors.providerName}\` provider cannot read its relay`);

	const name = tracker.integration ?? DEFAULT_RELAY_INTEGRATION;
	const rule = tracker.rule ?? DEFAULT_RELAY_RULE;
	let state;
	try {
		state = await errors.inspectRelay({ name, projects: tracker.projects, rule: { name: rule } });
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return skipBoth(noToken);
		return [
			resultRow(INTEGRATION_ID, INTEGRATION_TITLE, [shown(describeProviderError(err))], ""),
			skipRow(RULE_ID, RULE_TITLE, "not checked: could not read the integration"),
		];
	}

	const expected = `https://${layout.relay!.host}/${errors.providerName}`;
	const integrationProblems: string[] = [];
	if (!state.integration) {
		integrationProblems.push(`no integration named ${shown(name)}`);
	} else {
		const posts = state.integration.webhookUrl;
		if (bare(posts ?? "") !== expected) {
			integrationProblems.push(`${shown(name)} posts to ${shown(posts ?? "nowhere")}, not ${shown(expected)}`);
		}
		if (!state.integration.alertAction)
			integrationProblems.push(`${shown(name)} is not offered as an alert action`);
	}

	const ruleProblems: string[] = [];
	for (const project of tracker.projects) {
		const found = state.rules.find((r) => r.project === project);
		if (!found) {
			ruleProblems.push(`${shown(project)}: no rule named ${shown(rule)} on it`);
			continue;
		}
		if (!found.enabled) ruleProblems.push(`${shown(project)}: ${shown(rule)} is disabled`);
		if (!found.sends) ruleProblems.push(`${shown(project)}: ${shown(rule)} does not send through ${shown(name)}`);
	}

	const n = tracker.projects.length;
	return [
		resultRow(INTEGRATION_ID, INTEGRATION_TITLE, integrationProblems, `${shown(name)} posts to ${shown(expected)}`),
		resultRow(RULE_ID, RULE_TITLE, ruleProblems, n === 0 ? "none declared" : `${n} of ${n} projects`),
	];
}
