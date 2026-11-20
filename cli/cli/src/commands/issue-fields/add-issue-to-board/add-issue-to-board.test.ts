import { describe, expect, it, vi } from "vitest";

import { board, fakeProjects, loadedWith, loaderWith, memoryIo } from "../../project/testing/fake-projects.js";
import { addIssueToBoard } from "./add-issue-to-board.js";

const context = { repoRoot: "/tmp/test" };
const DECLARED = { projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }] };

async function run(
	over: { projects?: Record<string, unknown>; board?: string; dryRun?: boolean; declared?: unknown } = {}
) {
	const loaded = loadedWith((over.declared as Record<string, unknown> | undefined) ?? DECLARED);
	const projects = fakeProjects({
		find: vi.fn(async () => board("v5")),
		addItems: vi.fn(async (_o: string, _b: unknown, items: Array<{ key: string }>) =>
			items.map((i) => ({ key: i.key, added: true, dropped: [] as string[] }))
		),
		...(over.projects ?? {}),
	});
	const loader = loaderWith(loaded, { projects });
	await loader.load();
	const result = await addIssueToBoard({
		loaded,
		context,
		loader,
		board: over.board ?? "V5",
		key: "#12",
		priority: "high",
		...(over.dryRun ? { dryRun: true } : {}),
		io: memoryIo(),
	});
	return { result, projects };
}

describe("addIssueToBoard", () => {
	it("puts the issue on the declared board, with its priority", async () => {
		const { result, projects } = await run();
		expect(result).toMatchObject({ status: "ok", detail: 'added "v5"' });
		expect(projects.addItems).toHaveBeenCalledWith(
			"acme",
			expect.objectContaining({ name: "v5" }),
			[{ key: "#12", priority: "high" }],
			expect.objectContaining({ statuses: expect.anything() })
		);
	});

	it("says when the issue was already there, and what the board has no option for", async () => {
		const there = await run({
			projects: { addItems: vi.fn(async () => [{ key: "#12", added: false, dropped: [] }]) },
		});
		expect(there.result.detail).toBe('already on "v5"');
		const dropped = await run({
			projects: {
				addItems: vi.fn(async () => [
					{ key: "#12", added: true, dropped: ["priority high (no matching option on the board)"] },
				]),
			},
		});
		expect(dropped.result).toMatchObject({ status: "skip" });
		expect(dropped.result.detail).toContain("not set: priority high");
	});

	it("reads and writes nothing on a dry run", async () => {
		const { result, projects } = await run({ dryRun: true });
		expect(result).toMatchObject({ status: "skip", detail: 'would add #12 to "v5"' });
		expect(projects.addItems).not.toHaveBeenCalled();
	});

	it("fails for a board the config does not declare, naming the declared ones", async () => {
		const { result, projects } = await run({ board: "nope" });
		expect(result.status).toBe("fail");
		expect(result.detail).toContain("declared: v5");
		expect(projects.addItems).not.toHaveBeenCalled();
	});

	it("fails when the board does not exist yet, and never makes one", async () => {
		const { result, projects } = await run({ projects: { find: vi.fn(async () => undefined) } });
		expect(result.status).toBe("fail");
		expect(result.detail).toContain("setup project");
		expect(projects.create).not.toHaveBeenCalled();
	});

	it("skips for a provider that cannot add items, and for no projects provider", async () => {
		const noAdd = await run({ projects: { addItems: undefined } });
		expect(noAdd.result.status).toBe("skip");
		const none = await addIssueToBoard({
			loaded: loadedWith({}),
			context,
			loader: { has: () => false, loadFailures: () => [] } as never,
			board: "v5",
			key: "#1",
			io: memoryIo(),
		});
		expect(none.status).toBe("skip");
	});

	it("turns a provider error into a failing row", async () => {
		const { result } = await run({ projects: { find: vi.fn(async () => Promise.reject(new Error("boom"))) } });
		expect(result).toMatchObject({ status: "fail" });
		expect(result.detail).toContain("boom");
	});
});
