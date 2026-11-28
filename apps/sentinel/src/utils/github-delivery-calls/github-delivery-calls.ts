import { AsyncLocalStorage } from "node:async_hooks";

import type { GitHubCallLogger } from "../github-call-log/index.js";
import type { GitHubDeliveryCalls, GitHubDeliveryInfo } from "./github-delivery-calls.type.js";

/** The message of the one line logged when a delivery ends, with how many calls it made. */
export const GITHUB_DELIVERY_LOG_MSG = "githubDelivery";

const deliveries = new AsyncLocalStorage<GitHubDeliveryCalls>();

/** Runs a delivery with its own call counter, which every GitHub call made inside it (however deep) adds to. */
export function runWithGitHubCalls<T>(run: () => Promise<T>): Promise<T> {
	return deliveries.run({ calls: 0, contents: 0 }, run);
}

/** Says what the current delivery is, as soon as it is known. Outside a delivery it does nothing. */
export function describeGitHubDelivery(info: GitHubDeliveryInfo): void {
	const current = deliveries.getStore();
	if (current !== undefined) Object.assign(current, info);
}

/** The fields that say which delivery a call belongs to; empty outside one. */
export function githubDeliveryFields(): GitHubDeliveryInfo {
	const current = deliveries.getStore();
	return current === undefined ? {} : { event: current.event, repo: current.repo, delivery: current.delivery };
}

/** Counts one call against the current delivery; `contents` is whether it read a config file or directory. */
export function recordGitHubCall(contents: boolean): void {
	const current = deliveries.getStore();
	if (current === undefined) return;
	current.calls += 1;
	if (contents) current.contents += 1;
}

/** Logs the current delivery's totals once, when it ends. A delivery that made no call logs nothing. */
export function logGitHubDelivery(logger: GitHubCallLogger): void {
	const current = deliveries.getStore();
	if (current === undefined || current.calls === 0) return;
	logger.info(
		{
			event: current.event,
			repo: current.repo,
			delivery: current.delivery,
			calls: current.calls,
			contents: current.contents,
		},
		GITHUB_DELIVERY_LOG_MSG
	);
}
