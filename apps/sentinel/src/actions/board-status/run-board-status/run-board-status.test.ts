import { type BoardItem, BUILTIN_TEMPLATES } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import type { BoardStatusTrigger } from "../board-status.type.js";
import type { LoadBoardStatusResult } from "../load-board-status/index.js";
import { runBoardStatus } from "./run-board-status.js";

const TEMPLATE = BUILTIN_TEMPLATES.roadmap;
const BOARD = { id: "b", number: 5, name: "v5", url: "u", closed: false };
const ENV = { SENTINEL_REPO: "acme/holocron" };
const GREEN = { key: "#12", state: "open", draft: false, checks: "success" } as const;
const DRAFT = { key: "#12", state: "open", draft: true, checks: "pending" } as const;

const item = (over: Partial<BoardItem> = {}): BoardItem => ({
	key: "#5",
	title: "t",
	open: true,
	status: "Todo",
	blockedBy: [],
	pullRequests: [GREEN],
	...over,
});

/** `closes`: what the GraphQL read says pull request 12 closes. */
function setup(
	items: BoardItem[],
	opts: { closes?: unknown[]; setStatus?: ReturnType<typeof vi.fn>; board?: unknown } = {}
) {
	const query = vi.fn(async () => ({
		repository: {
			pullRequest: {
				closingIssuesReferences: {
					nodes: opts.closes ?? [{ number: 5, repository: { nameWithOwner: "acme/widgets" } }],
				},
			},
		},
	}));
	const setStatus =
		opts.setStatus ??
		vi.fn(async (_o: string, _b: unknown, _k: string, status: string) => ({ transitioned: true, status }));
	const projects = {
		providerName: "github",
		find: vi.fn(async () => ("board" in opts ? opts.board : BOARD)),
		items: vi.fn(async () => items),
		setStatus,
	};
	const loadBoard = vi.fn(
		async () =>
			({
				ok: true,
				projects,
				owner: "acme",
				boards: [{ name: "v5", template: TEMPLATE }],
			}) as unknown as LoadBoardStatusResult
	);
	const client = { graphql: { query } } as unknown as GitHubClient;
	const go = (trigger: BoardStatusTrigger) =>
		runBoardStatus({ client, env: ENV, repo: "acme/widgets", trigger, loadBoard });
	return { projects, setStatus, query, loadBoard, go };
}

const PULL: BoardStatusTrigger = { kind: "pull_request", action: "opened", numbers: [12] };
const checkRun = (over: Record<string, unknown> = {}): BoardStatusTrigger => ({
	kind: "check_run",
	numbers: [12],
	check: { name: "ci / Required checks", headSha: "s", conclusion: "success", url: "u", ...over },
});

describe("runBoardStatus", () => {
	it("moves the closed issue's item to In Review when its pull request is green", async () => {
		const t = setup([item()]);
		expect(await t.go(PULL)).toEqual({
			status: "ok",
			applied: [{ board: "v5", key: "#5", from: "Todo", to: "In Review" }],
			failed: [],
		});
		expect(t.setStatus).toHaveBeenCalledWith("acme", BOARD, "#5", "In Review");
		expect(t.query).toHaveBeenCalledWith(expect.any(String), { owner: "acme", name: "widgets", number: 12 });
	});

	it("moves a draft pull request's item to In Progress, and leaves an item the delivery does not close", async () => {
		const t = setup([item({ pullRequests: [DRAFT] }), item({ key: "#6" })]);
		const result = await t.go(PULL);
		expect(result).toMatchObject({ applied: [{ key: "#5", to: "In Progress" }] });
		expect(t.setStatus).toHaveBeenCalledTimes(1);
	});

	it("changes nothing when the board is already right, so a redelivery is quiet", async () => {
		const t = setup([item({ status: "In Review" })]);
		expect(await t.go(checkRun())).toEqual({ status: "ok", applied: [], failed: [] });
		expect(t.setStatus).not.toHaveBeenCalled();
	});

	it("does not count a status the provider says was already set", async () => {
		const setStatus = vi.fn(async (_o: string, _b: unknown, _k: string, status: string) => ({
			transitioned: false,
			status,
		}));
		expect(await setup([item()], { setStatus }).go(PULL)).toMatchObject({ applied: [], failed: [] });
	});

	it("lets the blocked rule win, and sets Done for a closed issue", async () => {
		const blocked = await setup([item({ blockedBy: ["#1"] })]).go(PULL);
		expect(blocked).toMatchObject({ applied: [{ key: "#5", to: "Blocked" }] });
		const done = await setup([item({ open: false, pullRequests: [{ ...GREEN, state: "merged" }] })]).go({
			kind: "pull_request",
			action: "closed",
			numbers: [12],
		});
		expect(done).toMatchObject({ applied: [{ key: "#5", to: "Done" }] });
	});

	it("applies the unblocked then the pull request rule in one delivery", async () => {
		const t = setup([item({ status: "Blocked", pullRequests: [DRAFT] })]);
		const result = await t.go(PULL);
		expect(result).toMatchObject({
			applied: [
				{ key: "#5", from: "Blocked", to: "Todo" },
				{ key: "#5", from: "Todo", to: "In Progress" },
			],
		});
	});

	it("drops a check run that is not the aggregate verdict before loading or fetching anything", async () => {
		const t = setup([item()]);
		expect(await t.go(checkRun({ name: "lint" }))).toEqual({
			status: "skipped",
			reason: "lint is not the verdict",
		});
		expect(await t.go(checkRun({ conclusion: null }))).toMatchObject({ status: "skipped" });
		expect(await t.go(checkRun({ conclusion: "neutral" }))).toMatchObject({ status: "skipped" });
		expect(await t.go({ kind: "pull_request", action: "opened", numbers: [] })).toEqual({
			status: "skipped",
			reason: "no pull request to follow",
		});
		expect(t.loadBoard).not.toHaveBeenCalled();
		expect(t.query).not.toHaveBeenCalled();
	});

	it("is a quiet skip when not configured, or when the provider cannot list or set", async () => {
		const off = runBoardStatus({
			client: {} as GitHubClient,
			env: {},
			repo: "acme/widgets",
			trigger: PULL,
			loadBoard: async () => ({ ok: false, reason: "off" }),
		});
		expect(await off).toEqual({ status: "skipped", reason: "off" });
		const t = setup([]);
		delete (t.projects as { setStatus?: unknown }).setStatus;
		expect(await t.go(PULL)).toMatchObject({ status: "skipped", reason: expect.stringContaining("cannot list") });
		expect(await runBoardStatus({ client: {} as GitHubClient, env: {}, repo: "a/b", trigger: PULL })).toMatchObject(
			{
				status: "skipped",
			}
		);
	});

	it("skips a pull request that closes no issue, and a board that is not there", async () => {
		expect(await setup([item()], { closes: [] }).go(PULL)).toEqual({
			status: "skipped",
			reason: "the pull request closes no issue",
		});
		expect(await setup([item()], { board: undefined }).go(PULL)).toEqual({ status: "ok", applied: [], failed: [] });
	});

	it("keys an issue of another repository with its name", async () => {
		const t = setup([item({ key: "acme/other#9" })], {
			closes: [{ number: 9, repository: { nameWithOwner: "acme/other" } }],
		});
		expect(await t.go(PULL)).toMatchObject({ applied: [{ key: "acme/other#9", to: "In Review" }] });
	});

	it("lists an item that cannot be moved, and goes on with the rest", async () => {
		const setStatus = vi
			.fn()
			.mockRejectedValueOnce(new Error("no access"))
			.mockResolvedValueOnce({ transitioned: true, status: "In Review" })
			.mockResolvedValueOnce({ transitioned: true, status: "In Review" });
		const t = setup([item(), item({ key: "#6" }), item({ key: "#7" })], {
			setStatus,
			closes: [5, 6, 7].map((number) => ({ number, repository: { nameWithOwner: "acme/widgets" } })),
		});
		const result = await t.go(PULL);
		expect(result).toMatchObject({ status: "ok", failed: [{ key: "#5", message: "no access" }] });
		expect((result as { applied: unknown[] }).applied).toHaveLength(2);
	});

	it("lists a refusal that leaves the status where it was", async () => {
		const setStatus = vi.fn(async () => ({ transitioned: false, status: "Todo" }));
		const result = await setup([item()], { setStatus }).go(PULL);
		expect(result).toMatchObject({ failed: [{ key: "#5", message: "refused: still Todo" }] });
	});

	it("reports an unexpected error as fail and never throws", async () => {
		const t = setup([item()]);
		t.projects.find.mockRejectedValueOnce(new Error("boom"));
		expect(await t.go(PULL)).toEqual({ status: "fail", reason: "boom" });
	});
});
