import { describe, expect, it, vi } from "vitest";

import type { BoardItem } from "../../../plugin/index.js";
import { fakeBoards, fakeIssues, record } from "../testing.js";
import { collectRecords } from "./collect-records.js";

const src = (issues = fakeIssues("github"), projects?: ReturnType<typeof fakeBoards>) => ({
	ok: true as const,
	provider: "github",
	issues,
	...(projects ? { projects } : {}),
});

describe("collectRecords", () => {
	it("exports one issue by key", async () => {
		const issues = fakeIssues("github", { export: vi.fn(async () => [record("#1")]) });
		const out = await collectRecords({ source: src(issues), scope: { kind: "issue", key: "#1" } });
		expect(out).toMatchObject({ ok: true, records: [{ key: "#1" }] });
		expect(issues.export).toHaveBeenCalledWith({ keys: ["#1"] });
	});

	it("passes a selection through and adds open-only", async () => {
		const issues = fakeIssues("github", { export: vi.fn(async () => []) });
		await collectRecords({
			source: src(issues),
			scope: { kind: "issues", selector: { all: true } },
			openOnly: true,
		});
		expect(issues.export).toHaveBeenCalledWith({ all: true, openOnly: true });
	});

	it("refuses a source that cannot export", async () => {
		const out = await collectRecords({
			source: src(fakeIssues("x", { export: undefined })),
			scope: { kind: "issue", key: "#1" },
		});
		expect(out).toEqual({ ok: false, reason: "the `github` provider cannot export issues" });
	});

	it("reads a board's items, lays their status and priority over the records, skips other repositories", async () => {
		const issues = fakeIssues("github", {
			export: vi.fn(async () => [
				record("#1", { priority: undefined }),
				record("#2", { closed: true, statusCategory: "done", priority: "low" }),
			]),
		});
		const projects = fakeBoards({
			find: vi.fn(async () => ({ id: "b", name: "v5", url: "u", closed: false })),
			items: vi.fn(async (): Promise<BoardItem[]> => [
				{
					key: "#1",
					title: "a",
					open: true,
					status: "Blocked",
					category: "blocked",
					blockedBy: [],
					priority: "urgent" as const,
				},
				{
					key: "#2",
					title: "b",
					open: false,
					status: "Done",
					category: "planned",
					blockedBy: [],
					priority: "high" as const,
				},
				{ key: "o/other#9", title: "c", open: true, blockedBy: [] },
			]),
		});
		const out = await collectRecords({
			source: src(issues, projects),
			scope: { kind: "project", name: "v5", owner: "acme" },
		});
		expect(issues.export).toHaveBeenCalledWith({ keys: ["#1", "#2"] });
		expect(out).toMatchObject({ ok: true, notes: ["1 item(s) from other repositories were skipped"] });
		const records = (out as { records: ReturnType<typeof record>[] }).records;
		expect(records[0]).toMatchObject({ status: "Blocked", statusCategory: "in-progress", priority: "urgent" });
		// a closed issue keeps its category and an existing priority wins over the board's
		expect(records[1]).toMatchObject({ status: "Done", statusCategory: "done", priority: "low" });
	});

	it("finds a closed board among all boards, honours open-only, and keeps a record with no item as it was", async () => {
		const issues = fakeIssues("github", { export: vi.fn(async () => [record("#1"), record("#5")]) });
		const projects = fakeBoards({
			list: vi.fn(async () => [{ id: "b", name: "old", url: "u", closed: true }]),
			items: vi.fn(async (): Promise<BoardItem[]> => [
				{ key: "#1", title: "a", open: true, blockedBy: [] },
				{ key: "#2", title: "b", open: false, blockedBy: [] },
			]),
		});
		const out = await collectRecords({
			source: src(issues, projects),
			scope: { kind: "project", name: "old", owner: "acme" },
			openOnly: true,
		});
		expect(issues.export).toHaveBeenCalledWith({ keys: ["#1"] });
		expect((out as { records: unknown[] }).records).toHaveLength(2);
		expect(out).toMatchObject({ notes: [] });
	});

	it("fails on a missing board, a source with no board support, and a provider error", async () => {
		const noBoard = await collectRecords({
			source: src(undefined, fakeBoards({ items: vi.fn() })),
			scope: { kind: "project", name: "nope", owner: "a" },
		});
		expect(noBoard).toEqual({ ok: false, reason: 'no board named "nope" in github' });
		const noItems = await collectRecords({ source: src(), scope: { kind: "project", name: "x", owner: "a" } });
		expect(noItems).toMatchObject({ ok: false, reason: expect.stringContaining("cannot list the items") });
		const boom = await collectRecords({
			source: src(fakeIssues("github", { export: vi.fn(async () => Promise.reject(new Error("rate limited"))) })),
			scope: { kind: "issue", key: "#1" },
		});
		expect(boom).toEqual({ ok: false, reason: expect.stringContaining("rate limited") });
	});
});
