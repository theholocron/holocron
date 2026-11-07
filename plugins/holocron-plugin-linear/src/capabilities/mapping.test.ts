import type { LinearWorkflowState } from "@theholocron/linear-client";
import { describe, expect, it } from "vitest";

import { STATES } from "../test-helpers.js";
import {
	boardCategory,
	fromLinearPriority,
	isClosed,
	normalizeKey,
	pickState,
	stateTypeFor,
	statusCategory,
	toLinearPriority,
} from "./mapping.js";

const states = STATES as LinearWorkflowState[];

describe("priority", () => {
	it("maps both ways, with none as 0 and as undefined", () => {
		expect(toLinearPriority("urgent")).toBe(1);
		expect(toLinearPriority("low")).toBe(4);
		expect(toLinearPriority(undefined)).toBe(0);
		expect(toLinearPriority("none")).toBe(0);
		expect(fromLinearPriority(2)).toBe("high");
		expect(fromLinearPriority(0)).toBeUndefined();
	});
});

describe("categories", () => {
	it("maps state types to the issue categories", () => {
		expect(statusCategory({ type: "backlog", name: "x" })).toBe("open");
		expect(statusCategory({ type: "unstarted", name: "x" })).toBe("open");
		expect(statusCategory({ type: "triage", name: "x" })).toBe("open");
		expect(statusCategory({ type: "started", name: "Doing" })).toBe("in-progress");
		expect(statusCategory({ type: "started", name: "In Review" })).toBe("in-review");
		expect(statusCategory({ type: "completed", name: "x" })).toBe("done");
		expect(statusCategory({ type: "canceled", name: "x" })).toBe("done");
		expect(isClosed("canceled")).toBe(true);
		expect(isClosed("started")).toBe(false);
	});

	it("maps state types to the board categories, and a blocked started state to blocked", () => {
		expect(boardCategory({ type: "triage", name: "x" })).toBe("backlog");
		expect(boardCategory({ type: "backlog", name: "x" })).toBe("backlog");
		expect(boardCategory({ type: "unstarted", name: "x" })).toBe("planned");
		expect(boardCategory({ type: "started", name: "Doing" })).toBe("active");
		expect(boardCategory({ type: "started", name: "Blocked" })).toBe("blocked");
		expect(boardCategory({ type: "completed", name: "x" })).toBe("done");
		expect(boardCategory({ type: "canceled", name: "x" })).toBe("done");
	});

	it("makes the state type a board category is created as", () => {
		expect(stateTypeFor("backlog")).toBe("backlog");
		expect(stateTypeFor("planned")).toBe("unstarted");
		expect(stateTypeFor("active")).toBe("started");
		expect(stateTypeFor("blocked")).toBe("started");
		expect(stateTypeFor("done")).toBe("completed");
	});
});

describe("pickState", () => {
	it("prefers the name, then the category", () => {
		expect(pickState(states, { name: "in progress", category: "open" })?.id).toBe("s-prog");
		expect(pickState(states, { category: "open" })?.id).toBe("s-todo");
		expect(pickState(states, { category: "in-progress" })?.id).toBe("s-prog");
		expect(pickState(states, { category: "in-review" })?.id).toBe("s-review");
		expect(pickState(states, { category: "done" })?.id).toBe("s-done");
		expect(pickState(states, { category: "open", closed: true })?.id).toBe("s-done");
	});

	it("falls back when the team lacks a review state or a completed one", () => {
		const noReview = states.filter((s) => s.id !== "s-review");
		expect(pickState(noReview, { category: "in-review" })?.id).toBe("s-prog");
		expect(pickState([states[5]!], { category: "done" })?.id).toBe("s-cancel");
		expect(pickState([], { category: "open" })).toBeUndefined();
	});
});

describe("normalizeKey", () => {
	it("fills a bare number with the team key and upper-cases a key", () => {
		expect(normalizeKey("42", "ENG")).toBe("ENG-42");
		expect(normalizeKey("#42", "ENG")).toBe("ENG-42");
		expect(normalizeKey(" eng-7 ", "ENG")).toBe("ENG-7");
	});
});
