import { describe, expect, it } from "vitest";

import type { SentinelEvent } from "../../../utils/webhook/index.js";
import { toAreaLabelsTrigger } from "./to-area-labels-trigger.js";

const event = (over: Partial<SentinelEvent>): SentinelEvent => ({
	type: "pull_request.opened",
	installationId: 7,
	repo: "acme/demo",
	action: "opened",
	pullNumbers: [12],
	raw: {},
	...over,
});

describe("toAreaLabelsTrigger", () => {
	it("reads a pull request that was opened or pushed to", () => {
		expect(toAreaLabelsTrigger(event({}))).toEqual({ kind: "pull_request", number: 12 });
		expect(toAreaLabelsTrigger(event({ type: "pull_request.synchronize", action: "synchronize" }))).toEqual({
			kind: "pull_request",
			number: 12,
		});
	});

	it("reads a pull request edit only when the title changed", () => {
		const edited = { type: "pull_request.edited" as const, action: "edited" };
		expect(toAreaLabelsTrigger(event({ ...edited, raw: { changes: { title: { from: "a" } } } }))).toEqual({
			kind: "pull_request",
			number: 12,
		});
		expect(toAreaLabelsTrigger(event({ ...edited, raw: { changes: { body: { from: "a" } } } }))).toBeUndefined();
		expect(toAreaLabelsTrigger(event(edited))).toBeUndefined();
	});

	it("reads a reopened pull request and no other feed-only action", () => {
		const feed = { type: "pull_request.feed" as const };
		expect(toAreaLabelsTrigger(event({ ...feed, action: "reopened" }))).toEqual({
			kind: "pull_request",
			number: 12,
		});
		expect(toAreaLabelsTrigger(event({ ...feed, action: "closed" }))).toBeUndefined();
	});

	it("reads an issue", () => {
		expect(toAreaLabelsTrigger(event({ type: "issues.area", issueNumber: 9, pullNumbers: undefined }))).toEqual({
			kind: "issue",
			number: 9,
		});
		expect(toAreaLabelsTrigger(event({ type: "issues.area", pullNumbers: undefined }))).toBeUndefined();
	});

	it("does nothing for a pull request that names no number", () => {
		expect(toAreaLabelsTrigger(event({ pullNumbers: undefined }))).toBeUndefined();
		expect(toAreaLabelsTrigger(event({ pullNumbers: [] }))).toBeUndefined();
	});

	it("does nothing for a delivery a bot caused", () => {
		expect(toAreaLabelsTrigger(event({ raw: { sender: { type: "Bot" } } }))).toBeUndefined();
		expect(
			toAreaLabelsTrigger(event({ type: "issues.area", issueNumber: 9, raw: { sender: { type: "Bot" } } }))
		).toBeUndefined();
		expect(toAreaLabelsTrigger(event({ raw: { sender: { type: "User" } } }))).toEqual({
			kind: "pull_request",
			number: 12,
		});
	});

	it("does nothing for an event it does not read", () => {
		expect(toAreaLabelsTrigger(event({ type: "pull_request_review" }))).toBeUndefined();
		expect(toAreaLabelsTrigger(event({ type: "push.default-branch" }))).toBeUndefined();
	});
});
