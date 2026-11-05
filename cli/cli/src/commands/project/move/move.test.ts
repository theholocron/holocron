import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { BoardItem, MoveReport, Projects } from "../../../plugin/index.js";
import { NonInteractiveError } from "../../../ui/non-interactive-error/index.js";
import { board, fakeProjects, loadedWith, loaderWith, memoryIo } from "../testing/fake-projects.js";
import { runProjectMove } from "./move.js";
import type { RunProjectMoveInput } from "./move.type.js";

const old = board("v4", { closed: true });
const next = board("v5");
const REPORT: MoveReport = { moved: ["#1", "#2"], kept: ["#3"], left: ["#4"] };

const item = (key: string, open = true): BoardItem => ({
	key,
	title: key,
	open,
	status: "Todo",
	category: "planned",
	blockedBy: [],
});

const provider = (over: Partial<Projects> = {}) =>
	fakeProjects({
		find: vi.fn(async (_owner: string, name: string) => (name === "v5" ? next : undefined)),
		list: vi.fn(async () => [old, next]),
		move: vi.fn(async () => REPORT),
		...over,
	});

async function run(caps: Record<string, unknown>, extra: Partial<RunProjectMoveInput> = {}, boards: unknown = []) {
	const lines: string[] = [];
	const loaded = loadedWith({ projects: ["github", { boards }] });
	const promise = runProjectMove({
		loaded,
		context: { repoRoot: "/tmp/test", ...(extra.context ?? {}) },
		from: "v4",
		to: "v5",
		loader: loaderWith(loaded, caps),
		io: memoryIo(),
		interactive: true,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...extra,
	});
	return { promise, text: () => lines.join("\n") };
}

describe("project move", () => {
	it("moves after the answer is yes and prints moved, kept and left", async () => {
		const projects = provider();
		const confirm = vi.fn().mockResolvedValue(true);
		const { promise, text } = await run({ projects }, { confirm });
		const report = await promise;
		expect(confirm).toHaveBeenCalledWith('Move the open items of "v4" to "v5"?');
		expect(projects.move).toHaveBeenCalledWith("acme", old, next, expect.objectContaining({ name: "roadmap" }));
		expect(report).toEqual({ status: "ok", moved: REPORT });
		expect(text()).toContain("moved: 2 (#1, #2)");
		expect(text()).toContain("kept (already on the target): 1 (#3)");
		expect(text()).toContain("left (closed, stay on the old board): 1 (#4)");
	});

	it("finds the old board among the closed ones, but the new one only among the open", async () => {
		const projects = provider();
		await (
			await run({ projects }, { yes: true })
		).promise;
		expect(projects.find).toHaveBeenCalledWith("acme", "v4");
		expect(projects.list).toHaveBeenCalled();
		const missing = await (
			await run({ projects: provider({ find: vi.fn(async () => undefined) }) }, { yes: true })
		).promise;
		expect(missing).toMatchObject({ status: "fail", reason: 'no open board named "v5"' });
	});

	it("moves without asking on --yes", async () => {
		const confirm = vi.fn();
		const projects = provider();
		await (
			await run({ projects }, { yes: true, confirm })
		).promise;
		expect(confirm).not.toHaveBeenCalled();
		expect(projects.move).toHaveBeenCalled();
	});

	it("moves nothing when the answer is no", async () => {
		const projects = provider();
		const { promise, text } = await run({ projects }, { confirm: vi.fn().mockResolvedValue(false) });
		expect(await promise).toEqual({ status: "cancelled" });
		expect(projects.move).not.toHaveBeenCalled();
		expect(text()).toContain("cancelled; nothing was changed");
	});

	it("refuses to ask without a terminal", async () => {
		const { promise } = await run({ projects: provider() }, { interactive: false });
		await expect(promise).rejects.toBeInstanceOf(NonInteractiveError);
	});

	it("skips cleanly when the provider cannot move", async () => {
		const { promise, text } = await run({ projects: provider({ move: undefined }) }, { yes: true });
		expect(await promise).toMatchObject({ status: "skip" });
		expect(text()).toContain("provider cannot move items between boards");
	});

	it("skips when there is no projects provider", async () => {
		const loaded = loadedWith({});
		const report = await runProjectMove({
			loaded,
			context: { repoRoot: "/tmp/test" },
			from: "v4",
			to: "v5",
			loader: loaderWith(loaded, {}),
			yes: true,
			print: () => {},
		});
		expect(report).toMatchObject({ status: "skip", reason: "no `projects` provider is configured" });
	});

	it("fails with every problem when the options do not read", async () => {
		const { promise } = await run({ projects: provider() }, { yes: true }, "nope");
		expect(await promise).toMatchObject({ status: "fail" });
	});

	it("fails when the old board does not exist", async () => {
		const { promise } = await run({ projects: provider({ list: vi.fn(async () => [next]) }) }, { yes: true });
		expect(await promise).toMatchObject({ status: "fail", reason: 'no board named "v4"' });
	});

	it("fails when the template does not exist", async () => {
		const { promise } = await run({ projects: provider() }, { yes: true, template: "nope" });
		expect(await promise).toMatchObject({ status: "fail", reason: 'no template named "nope"' });
	});

	it("reads statuses with the template the target board is declared with", async () => {
		const projects = provider();
		await (
			await run({ projects }, { yes: true }, [{ template: "sprint", name: "v5" }])
		).promise;
		expect((projects.move as ReturnType<typeof vi.fn>).mock.calls[0]![3]).toMatchObject({ name: "sprint" });
	});

	it("falls back to the template of the old board when only that one is declared", async () => {
		const projects = provider();
		await (
			await run({ projects }, { yes: true }, [{ template: "sprint", name: "v4" }])
		).promise;
		expect((projects.move as ReturnType<typeof vi.fn>).mock.calls[0]![3]).toMatchObject({ name: "sprint" });
	});

	it("fails when the provider throws", async () => {
		const projects = provider({ move: vi.fn().mockRejectedValue(new Error("rate limited")) });
		const { promise, text } = await run({ projects }, { yes: true });
		expect(await promise).toMatchObject({ status: "fail", reason: "rate limited" });
		expect(text()).toContain("rate limited");
	});

	it("fails when finding the boards throws", async () => {
		const projects = provider({ find: vi.fn().mockRejectedValue(new Error("no token")) });
		const { promise } = await run({ projects }, { yes: true });
		expect(await promise).toMatchObject({ status: "fail", reason: "no token" });
	});
});

describe("project move --dry-run", () => {
	const dry = { context: { repoRoot: "/tmp/test", dryRun: true } };

	it("previews from both boards' items and never calls move or asks", async () => {
		const items = vi.fn(async (_owner: string, b: { name: string }) =>
			b.name === "v4" ? [item("#1"), item("#2"), item("#3"), item("#4", false)] : [item("#3")]
		);
		const projects = provider({ items: items as never });
		const confirm = vi.fn();
		const { promise, text } = await run({ projects }, { ...dry, confirm });
		const report = await promise;
		expect(report).toEqual({ status: "ok", moved: { moved: ["#1", "#2"], kept: ["#3"], left: ["#4"] } });
		expect(projects.move).not.toHaveBeenCalled();
		expect(confirm).not.toHaveBeenCalled();
		expect(text()).toContain("dry run: nothing was moved");
		expect(text()).toContain("would move: 2 (#1, #2)");
		expect(text()).toContain("would keep (already on the target): 1 (#3)");
	});

	it("skips when the provider cannot list items to preview", async () => {
		const { promise } = await run({ projects: provider() }, dry);
		expect(await promise).toMatchObject({ status: "skip" });
	});

	it("fails when listing items throws", async () => {
		const projects = provider({ items: vi.fn().mockRejectedValue(new Error("boom")) });
		const { promise } = await run({ projects }, dry);
		expect(await promise).toMatchObject({ status: "fail", reason: "boom" });
	});

	it("prints an empty preview without a list", async () => {
		const projects = provider({ items: vi.fn(async () => []) as never });
		const { promise, text } = await run({ projects }, dry);
		await promise;
		expect(text()).toContain("would move: 0");
	});
});
