import { describe, expect, it } from "vitest";

import type { SentinelEvent } from "../../../utils/webhook/index.js";
import { toPrFeedTrigger } from "./to-pr-feed-trigger.js";

const event = (over: Partial<SentinelEvent>): SentinelEvent => ({
	type: "pull_request.opened",
	repo: "acme/widgets",
	installationId: 1,
	raw: {},
	...over,
});
const CHECK = { name: "ci / Required checks", headSha: "abc", conclusion: "success", url: "u" };

describe("toPrFeedTrigger", () => {
	it("maps every pull_request event the checks or the feed read", () => {
		for (const type of [
			"pull_request.opened",
			"pull_request.synchronize",
			"pull_request.edited",
			"pull_request.feed",
		] as const) {
			expect(toPrFeedTrigger(event({ type, action: "x", pullNumbers: [3] }))).toEqual({
				kind: "pull_request",
				action: "x",
				numbers: [3],
			});
		}
	});

	it("maps a review and a check run", () => {
		expect(toPrFeedTrigger(event({ type: "pull_request_review", pullNumbers: [3] }))).toEqual({
			kind: "review",
			numbers: [3],
		});
		expect(toPrFeedTrigger(event({ type: "check_run.completed", pullNumbers: [3, 4], checkRun: CHECK }))).toEqual({
			kind: "check_run",
			numbers: [3, 4],
			check: CHECK,
		});
	});

	it("is undefined for an event the feed does not read, or one that lacks what it needs", () => {
		expect(toPrFeedTrigger(event({ type: "push.default-branch", pullNumbers: [3] }))).toBeUndefined();
		expect(toPrFeedTrigger(event({ type: "pull_request.opened", action: "opened" }))).toBeUndefined();
		expect(toPrFeedTrigger(event({ type: "pull_request.opened", pullNumbers: [3] }))).toBeUndefined();
		expect(toPrFeedTrigger(event({ type: "check_run.completed", pullNumbers: [3] }))).toBeUndefined();
	});
});
