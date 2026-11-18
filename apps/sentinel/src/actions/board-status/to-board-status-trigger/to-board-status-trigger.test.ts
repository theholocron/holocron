import { describe, expect, it } from "vitest";

import type { SentinelEvent } from "../../../utils/webhook/index.js";
import { toBoardStatusTrigger } from "./to-board-status-trigger.js";

const event = (over: Partial<SentinelEvent>): SentinelEvent => ({
	type: "pull_request.opened",
	repo: "acme/widgets",
	installationId: 1,
	raw: {},
	...over,
});
const CHECK = { name: "ci / Required checks", headSha: "abc", conclusion: "success", url: "u" };

describe("toBoardStatusTrigger", () => {
	it("maps the pull_request actions that start, end or re-shape the work", () => {
		for (const [type, action] of [
			["pull_request.opened", "opened"],
			["pull_request.feed", "reopened"],
			["pull_request.feed", "ready_for_review"],
			["pull_request.feed", "converted_to_draft"],
			["pull_request.feed", "closed"],
		] as const) {
			expect(toBoardStatusTrigger(event({ type, action, pullNumbers: [3] }))).toEqual({
				kind: "pull_request",
				action,
				numbers: [3],
			});
		}
	});

	it("ignores the actions the rules do not read", () => {
		for (const [type, action] of [
			["pull_request.synchronize", "synchronize"],
			["pull_request.edited", "edited"],
			["pull_request.feed", "labeled"],
			["pull_request.feed", "review_requested"],
		] as const) {
			expect(toBoardStatusTrigger(event({ type, action, pullNumbers: [3] }))).toBeUndefined();
		}
		expect(toBoardStatusTrigger(event({ type: "pull_request.feed", pullNumbers: [3] }))).toBeUndefined();
	});

	it("maps the aggregate check run, and nothing without a pull request", () => {
		expect(
			toBoardStatusTrigger(event({ type: "check_run.completed", pullNumbers: [3, 4], checkRun: CHECK }))
		).toEqual({
			kind: "check_run",
			numbers: [3, 4],
			check: CHECK,
		});
		expect(toBoardStatusTrigger(event({ type: "check_run.completed", pullNumbers: [3] }))).toBeUndefined();
		expect(toBoardStatusTrigger(event({ type: "check_run.completed", checkRun: CHECK }))).toBeUndefined();
	});

	it("ignores a review, a push and an installation", () => {
		expect(toBoardStatusTrigger(event({ type: "pull_request_review", pullNumbers: [3] }))).toBeUndefined();
		expect(toBoardStatusTrigger(event({ type: "push.default-branch", pullNumbers: [3] }))).toBeUndefined();
	});
});
