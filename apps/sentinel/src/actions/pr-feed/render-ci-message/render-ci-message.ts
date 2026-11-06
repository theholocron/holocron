import { ciMessageMarker } from "../ci-message-marker/index.js";
import type { CiVerdict } from "../pr-feed.type.js";

/** Failed checks listed before `and N more`, the cut the failed-run post uses. */
const MAX_FAILED = 5;

/**
 * The message a thread gets when `ci / Required checks` finishes: passed, or failed with the checks that did not
 * succeed. It ends with `ciMessageMarker()`, which the handler reads back to post each verdict once.
 */
export function renderCiMessage(verdict: CiVerdict): string {
	const short = verdict.sha.slice(0, 7);
	const marker = ciMessageMarker(verdict.sha, verdict.conclusion);
	if (verdict.conclusion === "success") {
		return [`✅ CI passed on ${short} ([run](${verdict.runUrl}))`, marker].join("\n");
	}
	const lines = [`❌ CI failed on ${short} (${verdict.conclusion}) ([run](${verdict.runUrl}))`];
	for (const check of verdict.failed.slice(0, MAX_FAILED)) lines.push(`- [${check.name}](${check.url})`);
	if (verdict.failed.length > MAX_FAILED) lines.push(`and ${verdict.failed.length - MAX_FAILED} more`);
	if (verdict.summaryUrl) lines.push(`[Every expected check](${verdict.summaryUrl})`);
	lines.push(marker);
	return lines.join("\n");
}
