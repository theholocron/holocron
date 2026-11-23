import { describe, expect, it } from "vitest";

import type { SentinelEvent } from "../../../utils/webhook/index.js";
import { toCiAggregateTrigger } from "./to-ci-aggregate-trigger.js";

const event = (type: SentinelEvent["type"], over: Partial<SentinelEvent> = {}): SentinelEvent => ({
	type,
	repo: "acme/demo",
	installationId: 1,
	raw: {},
	...over,
});
const prs = [{ number: 12, baseRef: "alpha" }];

describe("toCiAggregateTrigger", () => {
	it("posts the check for a pull request opened or pushed to, with its commit and base", () => {
		for (const type of ["pull_request.opened", "pull_request.synchronize"] as const) {
			expect(toCiAggregateTrigger(event(type, { headSha: "abc", pullRequests: prs }))).toEqual({
				kind: "pull_request",
				sha: "abc",
				pullRequests: prs,
				branches: [],
			});
		}
	});

	it("takes a reopened or ready pull request, and no other feed-only action", () => {
		for (const action of ["reopened", "ready_for_review"]) {
			expect(toCiAggregateTrigger(event("pull_request.feed", { action, pullRequests: prs }))).toMatchObject({
				kind: "pull_request",
			});
		}
		expect(
			toCiAggregateTrigger(event("pull_request.feed", { action: "labeled", pullRequests: prs }))
		).toBeUndefined();
		expect(toCiAggregateTrigger(event("pull_request.feed", { pullRequests: prs }))).toBeUndefined();
		expect(toCiAggregateTrigger(event("pull_request.feed", { action: "reopened" }))).toBeUndefined();
	});

	it("has nothing to do for a pull request delivery that names no pull request", () => {
		expect(toCiAggregateTrigger(event("pull_request.opened"))).toBeUndefined();
	});

	it("reads a finished check run, a Re-run and a status with their name and commit", () => {
		expect(
			toCiAggregateTrigger(
				event("check_run.leaf", { headSha: "abc", checkName: "test:unit / Conclusion", pullRequests: prs })
			)
		).toEqual({ kind: "check_run", sha: "abc", name: "test:unit / Conclusion", pullRequests: prs, branches: [] });
		expect(toCiAggregateTrigger(event("check_run.rerequested", { checkName: "ci / Required checks" }))).toEqual({
			kind: "rerequested",
			name: "ci / Required checks",
			pullRequests: [],
			branches: [],
		});
		expect(
			toCiAggregateTrigger(event("status", { headSha: "abc", checkName: "codecov/patch", branches: ["feat/x"] }))
		).toEqual({ kind: "status", sha: "abc", name: "codecov/patch", pullRequests: [], branches: ["feat/x"] });
	});

	it("leaves out the commit and name a delivery did not carry", () => {
		expect(toCiAggregateTrigger(event("check_run.leaf"))).toEqual({
			kind: "check_run",
			pullRequests: [],
			branches: [],
		});
	});

	it("reads no other event", () => {
		for (const type of [
			"push.default-branch",
			"pull_request_review",
			"check_run.completed",
			"issues.area",
		] as const) {
			expect(toCiAggregateTrigger(event(type, { pullRequests: prs }))).toBeUndefined();
		}
	});
});
