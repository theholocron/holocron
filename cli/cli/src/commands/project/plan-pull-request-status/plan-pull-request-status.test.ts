import { describe, expect, it } from "vitest";

import type { BoardItem, BoardPullRequest, BoardTemplate } from "../../../plugin/index.js";
import { ROADMAP_TEMPLATE } from "../templates/roadmap/index.js";
import { planPullRequestStatus } from "./index.js";

const pr = (over: Partial<BoardPullRequest> = {}): BoardPullRequest => ({
	key: "#100",
	state: "open",
	draft: false,
	checks: "none",
	...over,
});

const item = (over: Partial<BoardItem> = {}): BoardItem => ({
	key: "#1",
	title: "title #1",
	open: true,
	blockedBy: [],
	status: "Todo",
	pullRequests: [pr()],
	...over,
});

const green = [pr({ checks: "success" })];
const OPEN = { to: "In Progress", reason: "pull-request-open" };
const GREEN = { to: "In Review", reason: "checks-green" };

describe("planPullRequestStatus", () => {
	const rows: Array<[string, BoardItem, { to: string; reason: string } | "none"]> = [
		["open pull request, Todo", item(), OPEN],
		["open pull request, Someday", item({ status: "Someday" }), OPEN],
		["draft pull request counts", item({ pullRequests: [pr({ draft: true })] }), OPEN],
		["open pull request, already In Progress", item({ status: "In Progress" }), "none"],
		["failing checks, Todo", item({ pullRequests: [pr({ checks: "failure" })] }), OPEN],
		["green, Todo", item({ pullRequests: green }), GREEN],
		["green, In Progress", item({ status: "In Progress", pullRequests: green }), GREEN],
		[
			"green draft goes to review",
			item({ status: "In Progress", pullRequests: [pr({ checks: "success", draft: true })] }),
			GREEN,
		],
		["green, already In Review", item({ status: "In Review", pullRequests: green }), "none"],
		[
			"failure demotes In Review",
			item({ status: "In Review", pullRequests: [pr({ checks: "failure" })] }),
			{ to: "In Progress", reason: "checks-failed" },
		],
		["pending leaves In Review", item({ status: "In Review", pullRequests: [pr({ checks: "pending" })] }), "none"],
		["no checks leaves In Review", item({ status: "In Review", pullRequests: [pr({ checks: "none" })] }), "none"],
		["pending, In Progress", item({ status: "In Progress", pullRequests: [pr({ checks: "pending" })] }), "none"],
		[
			"one green of several open is review",
			item({ pullRequests: [pr({ checks: "failure" }), pr({ key: "#101", checks: "success" })] }),
			GREEN,
		],
		[
			"one green keeps review despite a failing one",
			item({
				status: "In Review",
				pullRequests: [pr({ checks: "failure" }), pr({ key: "#101", checks: "success" })],
			}),
			"none",
		],
		[
			"a closed pull request alone is nothing",
			item({ pullRequests: [pr({ state: "closed", checks: "success" })] }),
			"none",
		],
		[
			"a merged pull request alone is nothing",
			item({ pullRequests: [pr({ state: "merged", checks: "success" })] }),
			"none",
		],
		[
			"a green closed pull request does not count beside an open one",
			item({ pullRequests: [pr({ state: "closed", checks: "success" }), pr({ key: "#101" })] }),
			OPEN,
		],
		["no pull request", item({ pullRequests: [] }), "none"],
		["pull requests not read", item({ pullRequests: undefined }), "none"],
		["blocked wins by status", item({ status: "Blocked", pullRequests: green }), "none"],
		["blocked wins by blocker", item({ blockedBy: ["#9"], pullRequests: green }), "none"],
		["closed item is planReconcile's", item({ open: false, pullRequests: green }), "none"],
		["done is left alone", item({ status: "Done", pullRequests: green }), "none"],
		["no status is not set", item({ status: undefined, pullRequests: green }), "none"],
	];

	it.each(rows)("%s", (_name, input, expected) => {
		const plan = planPullRequestStatus(input, ROADMAP_TEMPLATE);
		expect(plan && { kind: plan.kind, to: "change" in plan ? plan.change.to : undefined }).toEqual(
			expected === "none" ? undefined : { kind: "change", to: expected.to }
		);
		expect(plan && "change" in plan ? plan.change.reason : undefined).toBe(
			expected === "none" ? undefined : expected.reason
		);
	});

	it("reads the category from the template by status name, then from the item", () => {
		expect(
			planPullRequestStatus(item({ status: "Waiting", category: "blocked" }), ROADMAP_TEMPLATE)
		).toBeUndefined();
		expect(planPullRequestStatus(item({ status: "Waiting", category: "planned" }), ROADMAP_TEMPLATE)).toMatchObject(
			{
				kind: "change",
			}
		);
		expect(planPullRequestStatus(item({ status: "Coding", category: "active" }), ROADMAP_TEMPLATE)).toBeUndefined();
		// The provider's category is wrong; the template wins.
		const wrong = item({ status: "Blocked", category: "review", pullRequests: green });
		expect(planPullRequestStatus(wrong, ROADMAP_TEMPLATE)).toBeUndefined();
	});

	it("picks the first status of a category in template order", () => {
		const template: BoardTemplate = {
			name: "tied",
			statuses: [
				{ name: "Next", category: "planned" },
				{ name: "Coding", category: "active" },
				{ name: "Hacking", category: "active" },
				{ name: "Look", category: "review" },
				{ name: "Look again", category: "review" },
			],
			fields: [],
			views: [],
		};
		expect(planPullRequestStatus(item({ status: "Next" }), template)).toMatchObject({ change: { to: "Coding" } });
		expect(planPullRequestStatus(item({ status: "Hacking", pullRequests: green }), template)).toMatchObject({
			change: { to: "Look" },
		});
	});

	it("reports, and does not guess, when the template lacks the category", () => {
		const template: BoardTemplate = {
			name: "bare",
			statuses: [
				{ name: "Todo", category: "planned" },
				{ name: "Doing", category: "active" },
			],
			fields: [],
			views: [],
		};
		expect(planPullRequestStatus(item({ status: "Doing", pullRequests: green }), template)).toEqual({
			kind: "unresolved",
			unresolved: { key: "#1", title: "title #1", category: "review", reason: "checks-green" },
		});
		const noActive: BoardTemplate = {
			name: "x",
			statuses: [{ name: "Todo", category: "planned" }],
			fields: [],
			views: [],
		};
		expect(planPullRequestStatus(item(), noActive)).toMatchObject({
			kind: "unresolved",
			unresolved: { category: "active", reason: "pull-request-open" },
		});
	});

	it("is idempotent: applying the change and planning again gives nothing", () => {
		const starts: BoardItem[] = [
			item(),
			item({ pullRequests: green }),
			item({ status: "In Review", pullRequests: [pr({ checks: "failure" })] }),
		];
		for (const start of starts) {
			const plan = planPullRequestStatus(start, ROADMAP_TEMPLATE) as { change: { to: string } };
			expect(plan.change.to).toBeDefined();
			expect(planPullRequestStatus({ ...start, status: plan.change.to }, ROADMAP_TEMPLATE)).toBeUndefined();
		}
	});
});
