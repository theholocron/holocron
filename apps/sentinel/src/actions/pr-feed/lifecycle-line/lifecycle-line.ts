import type { PullRequestSnapshot } from "../read-pull-request-state/index.js";
import type { LifecycleKind } from "./lifecycle-line.type.js";

const MARKER = /^-# pr: (opened|reopened|closed)$/m;

/**
 * The line a thread gets when a pull request opens, reopens or closes (merged, or closed without merging). It ends
 * with `-# pr: <kind>`, which {@link lastLifecycleKind} reads back so a redelivery is not posted twice.
 */
export function renderLifecycleLine(kind: LifecycleKind, snapshot: PullRequestSnapshot): string {
	const { state, diff, mergedBy } = snapshot;
	const author = state.authorIsBot ? `${state.author} (bot)` : state.author;
	const text =
		kind === "opened"
			? `🆕 Opened by ${author} into \`${state.base}\`: +${diff.additions} −${diff.deletions} in ${diff.changedFiles} ${diff.changedFiles === 1 ? "file" : "files"}`
			: kind === "reopened"
				? "🔄 Reopened"
				: state.merged
					? `🟣 Merged${mergedBy ? ` by ${mergedBy}` : ""}`
					: "⚪ Closed without merging";
	return `${text}\n-# pr: ${kind}`;
}

/** The kind of the newest lifecycle line among a thread's messages (newest first), or `undefined` when it has none. */
export function lastLifecycleKind(messages: string[]): LifecycleKind | undefined {
	for (const message of messages) {
		const found = MARKER.exec(message);
		if (found) return found[1] as LifecycleKind;
	}
	return undefined;
}
