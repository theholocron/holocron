import { describe, expect, it } from "vitest";

import { GitHubIssues } from "../capabilities/issues.js";
import { createGitHubClient } from "../rest.js";

import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";
const LABELS = { inProgress: "status:in-progress", inReview: "status:in-review" };

function makeIssues(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	const issues = new GitHubIssues(rest, { repo: REPO, labels: LABELS });
	return { issues, calls };
}

function rawIssue(
	overrides: Partial<{
		id: number;
		number: number;
		title: string;
		body: string | null;
		state: "open" | "closed";
		labels: Array<{ name: string }>;
		assignee: { login: string; name?: string; email?: string } | null;
		updated_at: string;
		html_url: string;
		pull_request?: unknown;
	}> = {}
) {
	return {
		id: 1001,
		number: 42,
		title: "Demo issue",
		body: null,
		state: "open" as const,
		labels: [],
		assignee: null,
		updated_at: "2026-06-29T00:00:00Z",
		html_url: "https://github.com/x/y/issues/42",
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────
// search / get / getMyself
// ──────────────────────────────────────────────────────────────────────

describe("GitHubIssues.search", () => {
	it("GETs /issues with state=all + limit when no filter specified", async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: [rawIssue()] }]);
		const result = await issues.search({});
		expect(result).toHaveLength(1);
		expect(result[0]?.key).toBe("#42");
		expect(calls[0]?.url).toContain("state=all");
		expect(calls[0]?.url).toContain("per_page=50");
	});

	it("passes openOnly + limit through to the query", async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: [] }]);
		await issues.search({ openOnly: true, limit: 5 });
		expect(calls[0]?.url).toContain("state=open");
		expect(calls[0]?.url).toContain("per_page=5");
	});

	it("filters out PRs (the issues endpoint includes them)", async () => {
		const { issues } = makeIssues([
			{
				status: 200,
				body: [rawIssue({ id: 1, number: 1 }), rawIssue({ id: 2, number: 2, pull_request: {} })],
			},
		]);
		const result = await issues.search({});
		expect(result.map((i) => i.key)).toEqual(["#1"]);
	});

	it('resolves assignee="currentUser" via /user first, then sets the assignee param', async () => {
		const { issues, calls } = makeIssues([
			{ status: 200, body: { login: "iamnewton" } },
			{ status: 200, body: [] },
		]);
		await issues.search({ assignee: "currentUser" });
		expect(calls[0]?.url).toContain("/user");
		expect(calls[1]?.url).toContain("assignee=iamnewton");
	});

	it("forwards an explicit assignee string as-is", async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: [] }]);
		await issues.search({ assignee: "someone-else" });
		expect(calls[0]?.url).toContain("assignee=someone-else");
	});

	it("maps open + status:in-progress label to category=in-progress", async () => {
		const { issues } = makeIssues([
			{
				status: 200,
				body: [rawIssue({ state: "open", labels: [{ name: "status:in-progress" }] })],
			},
		]);
		const [issue] = await issues.search({});
		expect(issue?.statusCategory).toBe("in-progress");
		expect(issue?.status).toBe("open + status:in-progress");
	});

	it("maps open + status:in-review label to category=in-review", async () => {
		const { issues } = makeIssues([
			{
				status: 200,
				body: [rawIssue({ state: "open", labels: [{ name: "status:in-review" }] })],
			},
		]);
		const [issue] = await issues.search({});
		expect(issue?.statusCategory).toBe("in-review");
	});

	it("maps closed → category=done", async () => {
		const { issues } = makeIssues([{ status: 200, body: [rawIssue({ state: "closed" })] }]);
		const [issue] = await issues.search({});
		expect(issue?.statusCategory).toBe("done");
		expect(issue?.status).toBe("closed");
	});

	it("maps assignee object via login/name/email", async () => {
		const { issues } = makeIssues([
			{
				status: 200,
				body: [
					rawIssue({
						assignee: { login: "iamnewton", name: "Newton", email: "n@example.com" },
					}),
				],
			},
		]);
		const [issue] = await issues.search({});
		expect(issue?.assignee).toEqual({
			id: "iamnewton",
			displayName: "Newton",
			emailAddress: "n@example.com",
		});
	});
});

describe("GitHubIssues.get", () => {
	it("GETs a single issue by number", async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: rawIssue() }]);
		const result = await issues.get("#42");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/issues/42`);
		expect(result.key).toBe("#42");
	});

	it('accepts plain number form ("42")', async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: rawIssue() }]);
		await issues.get("42");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/issues/42`);
	});

	it("accepts owner/repo#N form for the bound repo", async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: rawIssue() }]);
		await issues.get(`${REPO}#42`);
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/issues/42`);
	});

	it("errors when owner/repo#N references a different repo", async () => {
		const { issues } = makeIssues([]);
		await expect(issues.get("other-org/other-repo#42")).rejects.toThrow(/bound to/);
	});

	it("errors on garbage keys", async () => {
		const { issues } = makeIssues([]);
		await expect(issues.get("not-an-issue")).rejects.toThrow(/expected #N or N/);
	});
});

describe("GitHubIssues.getMyself", () => {
	it("GETs /user and maps to TrackerUser", async () => {
		const { issues, calls } = makeIssues([
			{ status: 200, body: { login: "iamnewton", name: "Newton", email: "n@example.com" } },
		]);
		const me = await issues.getMyself();
		expect(calls[0]?.url).toBe("https://api.github.com/user");
		expect(me).toEqual({
			id: "iamnewton",
			displayName: "Newton",
			emailAddress: "n@example.com",
		});
	});

	it("falls back to login when name is null", async () => {
		const { issues } = makeIssues([{ status: 200, body: { login: "iamnewton" } }]);
		const me = await issues.getMyself();
		expect(me.displayName).toBe("iamnewton");
	});
});

// ──────────────────────────────────────────────────────────────────────
// create
// ──────────────────────────────────────────────────────────────────────

describe("GitHubIssues.create", () => {
	it("POSTs with title + body + labels", async () => {
		const { issues, calls } = makeIssues([{ status: 201, body: rawIssue({ number: 99 }) }]);
		const result = await issues.create({
			summary: "New thing",
			body: "details",
			labels: ["bug"],
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({
			title: "New thing",
			body: "details",
			labels: ["bug"],
		});
		expect(result).toEqual({ key: "#99" });
	});

	it("resolves a numeric milestone reference directly (no API call)", async () => {
		const { issues, calls } = makeIssues([{ status: 201, body: rawIssue({ number: 100 }) }]);
		await issues.create({ summary: "x", milestone: "7" });
		expect(calls).toHaveLength(1); // no milestones lookup
		expect(calls[0]?.body).toMatchObject({ milestone: 7 });
	});

	it("resolves a milestone by title (case-insensitive)", async () => {
		const { issues, calls } = makeIssues([
			{ status: 200, body: [{ number: 12, title: "v0.1 — Feature parity" }] },
			{ status: 201, body: rawIssue({ number: 101 }) },
		]);
		await issues.create({ summary: "x", milestone: "V0.1 — feature parity" });
		expect(calls[0]?.url).toContain("/milestones");
		expect(calls[0]?.url).toContain("state=all");
		expect(calls[1]?.body).toMatchObject({ milestone: 12 });
	});

	it("throws when the milestone title is unknown", async () => {
		const { issues } = makeIssues([{ status: 200, body: [{ number: 1, title: "real" }] }]);
		await expect(issues.create({ summary: "x", milestone: "phantom" })).rejects.toThrow(/not found/);
	});
});

// ──────────────────────────────────────────────────────────────────────
// transition
// ──────────────────────────────────────────────────────────────────────

describe("GitHubIssues.transition — done slot", () => {
	it("closes an open issue and strips status:* labels", async () => {
		const { issues, calls } = makeIssues([
			// GET issue
			{
				status: 200,
				body: rawIssue({
					state: "open",
					labels: [{ name: "status:in-progress" }, { name: "bug" }],
				}),
			},
			{ status: 204 }, // DELETE label
			{ status: 200, body: {} }, // PATCH state=closed
		]);
		const result = await issues.transition("#42", "done");
		expect(result).toEqual({ transitioned: true, status: "closed", via: "closed (completed)" });
		expect(calls[1]?.method).toBe("DELETE");
		expect(calls[1]?.url).toContain("/labels/status%3Ain-progress");
		expect(calls[2]?.method).toBe("PATCH");
		expect(calls[2]?.body).toEqual({ state: "closed", state_reason: "completed" });
	});

	it("is idempotent — already-closed issue returns transitioned=false", async () => {
		const { issues, calls } = makeIssues([{ status: 200, body: rawIssue({ state: "closed" }) }]);
		const result = await issues.transition("#42", "done");
		expect(result.transitioned).toBe(false);
		expect(result.via).toBe("already closed");
		expect(calls).toHaveLength(1); // no writes
	});
});

describe("GitHubIssues.transition — inProgress / inReview slot", () => {
	it("opens + labels a fresh issue", async () => {
		const { issues, calls } = makeIssues([
			{ status: 200, body: rawIssue({ state: "open", labels: [] }) },
			{ status: 200, body: {} }, // POST labels
		]);
		const result = await issues.transition("#42", "inProgress");
		expect(result.transitioned).toBe(true);
		expect(result.status).toBe("open + status:in-progress");
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("/labels");
		expect(calls[1]?.body).toEqual({ labels: ["status:in-progress"] });
	});

	it("is idempotent when issue is already at the target", async () => {
		const { issues, calls } = makeIssues([
			{
				status: 200,
				body: rawIssue({ state: "open", labels: [{ name: "status:in-progress" }] }),
			},
		]);
		const result = await issues.transition("#42", "inProgress");
		expect(result.transitioned).toBe(false);
		expect(result.via).toBe("already there");
		expect(calls).toHaveLength(1);
	});

	it("strips other status:* labels when switching slots", async () => {
		const { issues, calls } = makeIssues([
			{
				status: 200,
				body: rawIssue({
					state: "open",
					labels: [{ name: "status:in-progress" }, { name: "bug" }],
				}),
			},
			{ status: 204 }, // DELETE status:in-progress
			{ status: 200, body: {} }, // POST status:in-review
		]);
		const result = await issues.transition("#42", "inReview");
		expect(result.transitioned).toBe(true);
		expect(calls[1]?.method).toBe("DELETE");
		expect(calls[1]?.url).toContain("/labels/status%3Ain-progress");
		expect(calls[2]?.method).toBe("POST");
		expect(calls[2]?.body).toEqual({ labels: ["status:in-review"] });
	});

	it("reopens a closed issue when transitioning back", async () => {
		const { issues, calls } = makeIssues([
			{ status: 200, body: rawIssue({ state: "closed", labels: [] }) },
			{ status: 200, body: {} }, // PATCH state=open
			{ status: 200, body: {} }, // POST labels
		]);
		await issues.transition("#42", "inProgress");
		expect(calls[1]?.method).toBe("PATCH");
		expect(calls[1]?.body).toEqual({ state: "open" });
		expect(calls[2]?.method).toBe("POST");
	});
});

// ──────────────────────────────────────────────────────────────────────
// comment / doctor
// ──────────────────────────────────────────────────────────────────────

describe("GitHubIssues.comment", () => {
	it("POSTs to /issues/{n}/comments with the body", async () => {
		const { issues, calls } = makeIssues([{ status: 201, body: {} }]);
		await issues.comment("#42", "this is a comment");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/issues/42/comments`);
		expect(calls[0]?.body).toEqual({ body: "this is a comment" });
	});
});

describe("GitHubIssues.doctor", () => {
	it("reports authed user + lifecycle label resolution status", async () => {
		const { issues } = makeIssues([
			{ status: 200, body: { login: "iamnewton", name: "Newton" } },
			{ status: 200, body: { full_name: REPO } },
			{ status: 200, body: [{ name: "status:in-progress" }, { name: "bug" }] },
		]);
		const report = await issues.doctor();
		expect(report.authedAs).toContain("Newton");
		expect(report.projectLabel).toBe(`Repo: ${REPO}`);
		expect(report.statuses).toHaveLength(4);
		expect(report.lifecycle[0]).toMatchObject({
			slot: "inProgress",
			value: "status:in-progress",
			resolved: true,
		});
		expect(report.lifecycle[1]).toMatchObject({
			slot: "inReview",
			value: "status:in-review",
			resolved: false, // label not in the repo's label list
		});
		expect(report.lifecycle[2]).toMatchObject({ slot: "done", resolved: true });
	});
});

// ──────────────────────────────────────────────────────────────────────
// Lazy label-degradation (labels omitted from options)
// ──────────────────────────────────────────────────────────────────────

function makeIssuesNoLabels(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	const issues = new GitHubIssues(rest, { repo: REPO });
	return { issues, calls };
}

describe("GitHubIssues without labels config", () => {
	it("constructs cleanly (no throw at plugin-load time)", () => {
		const { issues } = makeIssuesNoLabels([]);
		expect(issues).toBeInstanceOf(GitHubIssues);
	});

	it("transition to inProgress throws with a clear message", async () => {
		const { issues } = makeIssuesNoLabels([{ status: 200, body: rawIssue() }]);
		const err = await issues.transition("#42", "inProgress").catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/labels/);
		expect((err as Error).message).toMatch(/inProgress/);
	});

	it("transition to done still works (needs no labels)", async () => {
		const { issues } = makeIssuesNoLabels([
			{ status: 200, body: rawIssue({ state: "open" }) },
			{ status: 200, body: {} }, // PATCH to close
		]);
		const result = await issues.transition("#42", "done");
		expect(result.transitioned).toBe(true);
		expect(result.status).toBe("closed");
	});

	it("doctor reports the two label-backed slots as unresolved with an explanatory note", async () => {
		const { issues } = makeIssuesNoLabels([
			{ status: 200, body: { login: "cnewton", name: "Newton" } },
			{ status: 200, body: { full_name: REPO } },
			{ status: 200, body: [] },
		]);
		const report = await issues.doctor();
		expect(report.lifecycle[0]).toMatchObject({
			slot: "inProgress",
			value: null,
			resolved: false,
		});
		expect(report.lifecycle[0]?.note).toMatch(/no `labels`/);
		expect(report.lifecycle[1]).toMatchObject({ slot: "inReview", value: null, resolved: false });
		expect(report.lifecycle[2]).toMatchObject({ slot: "done", resolved: true });
	});
});
