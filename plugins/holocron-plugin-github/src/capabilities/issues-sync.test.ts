import { type IssueRecord, ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { GitHubIssues } from "./issues.js";
import { isRateLimited } from "./issues-sync.js";

const REPO = "theholocron/holocron";
const URL_1 = "https://linear.app/x/issue/ENG-1";

function make(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { issues: new GitHubIssues(createGitHubClient({ token: "pat", fetch }), { repo: REPO }), calls };
}

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "ENG-1",
	url: URL_1,
	title: "From Linear",
	body: "text",
	statusCategory: "open",
	closed: false,
	priority: "urgent",
	labels: ["bug"],
	assignee: { id: "u", displayName: "U" },
	blockedBy: [],
	comments: [{ author: "Han", body: "hi", createdAt: "2026-01-02T00:00:00Z" }],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-03T00:00:00Z",
	...over,
});

const BODY = `text\n\n---\n_Migrated from [ENG-1](${URL_1}); created 2026-01-01T00:00:00Z._\n<!-- holocron:migrated-from ${URL_1} -->`;

/** An issue a sync made, in step with `record()`. */
const made = (over: Record<string, unknown> = {}) => ({
	id: 1,
	number: 30,
	title: "From Linear",
	body: BODY,
	state: "open",
	labels: [{ name: "Bug" }, { name: "priority: urgent" }],
	updated_at: "2026-02-01T00:00:00Z",
	html_url: "https://github.com/theholocron/holocron/issues/30",
	assignee: null,
	milestone: null,
	...over,
});

const comment = (body: string) => ({ id: 1, body, created_at: "2026-01-02T00:00:00Z", user: null });
const HAN = "**Han** commented on 2026-01-02T00:00:00Z:\n\nhi";

describe("GitHubIssues.sync", () => {
	it("makes an issue that is missing, with its comments", async () => {
		const { issues, calls } = make([{ body: [] }, { body: { number: 12 } }, { status: 201, body: {} }]);
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res).toMatchObject({ source: "ENG-1", key: "#12", created: true, updated: false, changes: [] });
		expect(res?.dropped.join(" ")).toContain("assignee (not mapped)");
		expect((calls[1]?.body as { labels: string[] }).labels).toEqual(["bug", "priority: urgent"]);
		expect(calls[2]?.url).toContain("/issues/12/comments");
	});

	it("changes nothing on a dry run, create or update", async () => {
		const create = make([{ body: [] }]);
		const [created] = (await create.issues.sync?.([record()], { dryRun: true })) ?? [];
		expect(created).toMatchObject({ created: true, updated: false });
		expect(created?.key).toBeUndefined();
		expect(create.calls).toHaveLength(1);

		const update = make([{ body: [made({ title: "Old" })] }, { body: [] }]);
		const [updated] = (await update.issues.sync?.([record()], { dryRun: true })) ?? [];
		expect(updated).toMatchObject({ created: false, updated: true, changes: ["title", "comments"] });
		expect(update.calls).toHaveLength(2);
	});

	it("updates title, description, state, labels and adds the missing comment, keeping status labels", async () => {
		const { issues, calls } = make([
			{
				body: [
					made({
						title: "Old",
						body: `old\n<!-- holocron:migrated-from ${URL_1} -->`,
						state: "closed",
						labels: [{ name: "stale" }, { name: "status:in-review" }],
					}),
				],
			},
			{ body: [] },
			{ body: {} },
			{ status: 201, body: {} },
		]);
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res).toMatchObject({ key: "#30", created: false, updated: true });
		expect(res?.changes).toEqual(["title", "description", "state", "labels", "comments"]);
		expect(calls[2]?.method).toBe("PATCH");
		expect(calls[2]?.body).toEqual({
			title: "From Linear",
			body: BODY,
			state: "open",
			labels: ["bug", "priority: urgent", "status:in-review"],
		});
		expect(calls[3]?.body).toEqual({ body: HAN });
	});

	it("closes an issue the source closed, and reopens one it reopened", async () => {
		const close = make([{ body: [made()] }, { body: [comment(HAN)] }, { body: {} }]);
		await close.issues.sync?.([record({ closed: true })]);
		expect(close.calls[2]?.body).toEqual({ state: "closed", state_reason: "completed" });
		const reopen = make([{ body: [made({ state: "closed" })] }, { body: [comment(HAN)] }, { body: {} }]);
		await reopen.issues.sync?.([record()]);
		expect(reopen.calls[2]?.body).toEqual({ state: "open" });
	});

	it("leaves an issue alone when it matches, and never copies a comment twice, even one edited at the source", async () => {
		const { issues, calls } = make([
			{ body: [made({ body: BODY.replace(/\n/g, "\r\n") })] },
			{ body: [comment("**Han** commented on 2026-01-02T00:00:00Z:\n\nwhat it said before the edit")] },
		]);
		const [res] = (await issues.sync?.([record()])) ?? [];
		expect(res).toMatchObject({ key: "#30", created: false, updated: false, changes: [] });
		expect(calls).toHaveLength(2);
	});

	it("finds a comment with no author by its header too", async () => {
		const { issues, calls } = make([
			{ body: [made()] },
			{ body: [comment("Someone commented on 2026-01-02T00:00:00Z:\n\nhi")] },
		]);
		await issues.sync?.([record({ comments: [{ body: "hi", createdAt: "2026-01-02T00:00:00Z" }] })]);
		expect(calls).toHaveLength(2);
	});

	it("a second run after the first changes nothing", async () => {
		const first = make([{ body: [made({ title: "Old" })] }, { body: [comment(HAN)] }, { body: {} }]);
		const [a] = (await first.issues.sync?.([record()])) ?? [];
		expect(a?.updated).toBe(true);
		const second = make([{ body: [made()] }, { body: [comment(HAN)] }]);
		const [b] = (await second.issues.sync?.([record()])) ?? [];
		expect(b).toMatchObject({ created: false, updated: false });
		expect(second.calls.every((c) => c.method === "GET")).toBe(true);
	});

	it("does not touch an issue with no marker", async () => {
		const { issues, calls } = make([
			{ body: [made({ body: "someone else's issue" }), made({ number: 31, body: null })] },
			{ body: { number: 12 } },
			{ body: {} },
		]);
		const [res] = (await issues.sync?.([record({ comments: [] })])) ?? [];
		expect(res?.created).toBe(true);
		expect(calls.some((c) => c.method === "PATCH")).toBe(false);
	});

	it("stops cleanly on a rate limit and returns the records done", async () => {
		const { issues } = make([
			{ body: [] },
			{ body: { number: 12 } },
			{ status: 201, body: {} },
			{ status: 429, body: { message: "slow down" } },
		]);
		const out =
			(await issues.sync?.([record(), record({ key: "ENG-2", url: "https://linear.app/x/issue/ENG-2" })])) ?? [];
		expect(out.map((r) => r.source)).toEqual(["ENG-1"]);
	});

	it("treats a 403 that names the rate limit as one, and any other error as a failure", async () => {
		const limited = make([{ body: [] }, { status: 403, body: { message: "API rate limit exceeded" } }]);
		expect(await limited.issues.sync?.([record()])).toEqual([]);
		const denied = make([{ body: [] }, { status: 403, body: { message: "forbidden" } }]);
		await expect(denied.issues.sync?.([record()])).rejects.toThrow();
		const broken = make([{ body: [] }, { status: 422, body: { message: "bad" } }]);
		await expect(broken.issues.sync?.([record()])).rejects.toThrow();
	});
});

describe("isRateLimited", () => {
	it("is true for a 429 and a rate-limit 403 from the API, false for anything else", () => {
		expect(isRateLimited(new ProviderApiError("x", 429))).toBe(true);
		expect(isRateLimited(new ProviderApiError("rate limit", 403))).toBe(true);
		expect(isRateLimited(new ProviderApiError("x", 403, "rate limit"))).toBe(true);
		expect(isRateLimited(new ProviderApiError("x", 403))).toBe(false);
		expect(isRateLimited(new ProviderApiError("x", 500))).toBe(false);
		expect(isRateLimited(new Error("rate limit"))).toBe(false);
	});
});
