import { describe, expect, it } from "vitest";

import type { DiscussionPost, MonitoringIncident } from "../../plugin/index.js";
import { renderIncident, renderIncidentUpdate } from "../render-incident/index.js";
import { planIncidentFeed } from "./plan-incident-feed.js";

const page = { name: "The Holocron" };
const incident = (over: Partial<MonitoringIncident> = {}): MonitoringIncident => ({
	id: "i1",
	title: "Down",
	status: "investigating",
	impacts: [{ component: "Sentinel", impact: "major" }],
	startedAt: "2026-11-20T10:00:00Z",
	updates: [{ id: "u1", status: "investigating", text: "looking", at: "2026-11-20T10:00:00Z" }],
	...over,
});
const post = (over: Partial<DiscussionPost> = {}): DiscussionPost => ({
	url: "https://discord.test/p",
	title: "Down",
	state: "investigating",
	...over,
});
/** The messages of a post that is fully in step: the first message with its footer, and each update. */
const inStep = (i: MonitoringIncident) => [
	...i.updates.map(renderIncidentUpdate).reverse(),
	`${renderIncident(i, page).body}\n-# sync: key | investigating`,
];
const plan = (i: MonitoringIncident, p: DiscussionPost | undefined, messages: string[]) =>
	planIncidentFeed({ incident: i, rendered: renderIncident(i, page), post: p, messages });

describe("planIncidentFeed", () => {
	it("makes the post and appends every update for an incident with no post", () => {
		const i = incident({
			updates: [
				incident().updates[0]!,
				{ id: "u2", status: "identified", text: "x", at: "2026-11-20T11:00:00Z" },
			],
		});
		expect(plan(i, undefined, [])).toMatchObject({
			create: true,
			rewrite: false,
			append: i.updates,
			steps: ["create post", "append update u1", "append update u2"],
		});
	});

	it("closes the post it makes for an incident that is already resolved", () => {
		const resolved = incident({
			status: "resolved",
			updates: [{ id: "u1", status: "resolved", text: "ok", at: "2026-11-20" }],
		});
		expect(plan(resolved, undefined, [])).toMatchObject({ create: true, close: true });
	});

	it("plans nothing when the post is in step with the incident", () => {
		const i = incident();
		expect(plan(i, post(), inStep(i))).toEqual({
			id: "i1",
			create: false,
			rewrite: false,
			append: [],
			steps: [],
		});
	});

	it("appends only the updates whose marker is missing, then rewrites the summary and retags", () => {
		const before = incident();
		const after = incident({
			status: "identified",
			updates: [...before.updates, { id: "u2", status: "identified", text: "found", at: "2026-11-20T11:00:00Z" }],
		});
		const result = plan(after, post(), inStep(before));
		expect(result.append.map((u) => u.id)).toEqual(["u2"]);
		expect(result).toMatchObject({ rewrite: true, retag: "identified" });
		expect(result.steps).toEqual(["rewrite summary", "append update u2", "retag identified"]);
	});

	it("rewrites the summary, and nothing else, when the page's data changed but no update was added", () => {
		const before = incident();
		const edited = incident({ title: "Sentinel down" });
		const result = plan(edited, post(), inStep(before));
		expect(result).toMatchObject({ rewrite: true, append: [] });
		expect(result.retag).toBeUndefined();
	});

	it("closes the post when the incident is resolved and opens it again when it is reopened", () => {
		const resolved = incident({
			status: "resolved",
			updates: [{ id: "u1", status: "resolved", text: "ok", at: "2026-11-20" }],
		});
		expect(plan(resolved, post({ state: "resolved" }), inStep(resolved)).close).toBe(true);
		expect(plan(resolved, post({ state: "resolved", closed: true }), inStep(resolved)).close).toBeUndefined();
		const open = incident();
		expect(plan(open, post({ closed: true }), inStep(open))).toMatchObject({ close: false, steps: ["reopen"] });
	});

	it("rewrites when the post has no messages to compare with", () => {
		expect(plan(incident(), post(), []).rewrite).toBe(true);
	});
});
