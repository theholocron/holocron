import { describe, expect, it, vi } from "vitest";

import { ConfigError } from "../../../config/index.js";
import type { BoardItem } from "../../../plugin/index.js";
import { board, fakeProjects, inputFor, loadedWith } from "../project-test-kit/index.js";
import { runProjectStatus } from "./project-status.js";

const declared = [{ template: "roadmap", name: "v5" }];
const item = (over: Partial<BoardItem> = {}): BoardItem => ({
	key: "#12",
	title: "Twelve",
	open: true,
	status: "Todo",
	blockedBy: [],
	...over,
});

function setup(items: BoardItem[], over: Record<string, unknown> = {}, dryRun = false) {
	const projects = fakeProjects({
		find: async () => board(),
		items: async () => items,
		setStatus: async (_o: string, _b: unknown, _k: string, status: string) => ({ transitioned: true, status }),
		...over,
	});
	return { projects, ...inputFor(projects, { boards: declared, dryRun }) };
}

describe("project status", () => {
	it("sets the status and prints one line", async () => {
		const { projects, input, lines } = setup([item()]);
		const report = await runProjectStatus({ ...input, issue: "#12", status: "in progress" });
		expect(report).toMatchObject({ status: "ok", key: "#12", from: "Todo", to: "In Progress" });
		expect(projects.setStatus).toHaveBeenCalledWith("acme", board(), "#12", "In Progress");
		expect(lines).toEqual(["#12 Todo → In Progress"]);
	});

	it("takes the bare number, the hash form and the item's own key", async () => {
		for (const issue of ["12", "#12", " 12 "]) {
			const { projects, input } = setup([item()]);
			expect((await runProjectStatus({ ...input, issue, status: "Done" })).status).toBe("ok");
			expect(projects.setStatus).toHaveBeenCalledWith("acme", board(), "#12", "Done");
		}
	});

	it("takes owner/repo#n for an item in another repository", async () => {
		const { projects, input } = setup([item(), item({ key: "other/repo#12" })]);
		await runProjectStatus({ ...input, issue: "other/repo#12", status: "Done" });
		expect(projects.setStatus).toHaveBeenCalledWith("acme", board(), "other/repo#12", "Done");
	});

	it("reads owner/repo#n of this repository as the item's #n", async () => {
		const { projects, input } = setup([item()]);
		await runProjectStatus({ ...input, issue: "Acme/Demo#12", status: "Done" });
		expect(projects.setStatus).toHaveBeenCalledWith("acme", board(), "#12", "Done");
	});

	it("never matches another repository's number to a bare one", async () => {
		const { projects, input } = setup([item({ key: "other/repo#12" })]);
		expect((await runProjectStatus({ ...input, issue: "12", status: "Done" })).status).toBe("fail");
		expect(projects.setStatus).not.toHaveBeenCalled();
	});

	it("finds a tracker key that is not a number, in any case", async () => {
		const { projects, input } = setup([item({ key: "ENG-42" })]);
		await runProjectStatus({ ...input, issue: "eng-42", status: "Done" });
		expect(projects.setStatus).toHaveBeenCalledWith("acme", board(), "ENG-42", "Done");
	});

	it("says no status for an item without one, and (already) when nothing changed", async () => {
		const a = setup([item({ status: undefined as never })]);
		const first = await runProjectStatus({ ...a.input, issue: "12", status: "Done" });
		expect(a.lines[0]).toBe("#12 no status → Done");
		expect(first.from).toBeUndefined();

		const b = setup([item({ status: "Done" })], {
			setStatus: async (_o: string, _b: unknown, _k: string, status: string) => ({ transitioned: false, status }),
		});
		await runProjectStatus({ ...b.input, issue: "12", status: "Done" });
		expect(b.lines[0]).toBe("#12 Done → Done (already)");
	});

	it("fails and says how to add an issue that is not on the board", async () => {
		const { projects, input, lines } = setup([item()]);
		const report = await runProjectStatus({ ...input, issue: "#99", status: "Done" });
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toMatch(
			/#99 on board v5.*not on the board; add it first.*gh project item-add 7 --owner acme/
		);
		expect(projects.setStatus).not.toHaveBeenCalled();
	});

	it("names a board without a number in the add hint", async () => {
		const { input, lines } = setup([], { find: async () => board({ number: undefined as never }) });
		await runProjectStatus({ ...input, issue: "#1", status: "Done" });
		expect(lines.join("\n")).toContain("item-add <number>");
	});

	it("lists the valid statuses for one the template lacks", async () => {
		const { projects, input, lines } = setup([item()]);
		const report = await runProjectStatus({ ...input, issue: "#12", status: "Nope" });
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/valid: .*Todo.*In Progress.*Done/);
		expect(projects.setStatus).not.toHaveBeenCalled();
	});

	it("dry run prints the change and calls no mutator", async () => {
		const { projects, input, lines } = setup([item()], {}, true);
		const report = await runProjectStatus({ ...input, issue: "#12", status: "Done" });
		expect(report).toMatchObject({ status: "ok", to: "Done" });
		expect(lines.join("\n")).toContain("would set #12 Todo → Done");
		expect(projects.setStatus).not.toHaveBeenCalled();
	});

	it("fails when the provider refuses the status", async () => {
		const { input, lines } = setup([item()], {
			setStatus: async () => ({ transitioned: false, status: "Todo", via: "workflow" }),
		});
		expect((await runProjectStatus({ ...input, issue: "12", status: "Done" })).status).toBe("fail");
		expect(lines.join("\n")).toContain("refused: still Todo (workflow)");
	});

	it("fails with the reason when the provider has no refusal detail, or throws", async () => {
		const a = setup([item()], { setStatus: async () => ({ transitioned: false, status: "Todo" }) });
		await runProjectStatus({ ...a.input, issue: "12", status: "Done" });
		expect(a.lines.join("\n")).toContain("refused: still Todo");
		expect(a.lines.join("\n")).not.toContain("(undefined)");

		const b = setup([item()], {
			setStatus: async () => {
				throw new Error("boom");
			},
		});
		expect((await runProjectStatus({ ...b.input, issue: "12", status: "Done" })).status).toBe("fail");
		expect(b.lines.join("\n")).toContain("boom");
	});

	it("fails when the provider cannot list items or set a status", async () => {
		for (const missing of ["items", "setStatus"]) {
			const { input, lines } = setup([item()], { [missing]: undefined });
			expect((await runProjectStatus({ ...input, issue: "12", status: "Done" })).status).toBe("fail");
			expect(lines.join("\n")).toContain("cannot list items or set a status");
		}
	});

	it("fails when the board is missing or closed", async () => {
		const { input, lines } = setup([item()], { find: async () => undefined });
		expect((await runProjectStatus({ ...input, issue: "12", status: "Done" })).status).toBe("fail");
		expect(lines.join("\n")).toContain("holocron setup project");
	});

	it("fails for a template that does not exist", async () => {
		const projects = fakeProjects({ items: async () => [], setStatus: async () => ({}) });
		const { input, lines } = inputFor(projects, { boards: [{ template: "nope", name: "v5" }] });
		expect((await runProjectStatus({ ...input, issue: "12", status: "Done" })).status).toBe("fail");
		expect(lines.join("\n")).toContain('no template named "nope"');
	});

	it("picks the board with --board and defaults to the first", async () => {
		const projects = fakeProjects({
			find: async (_o: string, name: string) => board({ name }),
			items: async () => [item()],
			setStatus: async (_o: string, _b: unknown, _k: string, status: string) => ({ transitioned: true, status }),
		});
		const { input } = inputFor(projects, {
			boards: [
				{ template: "roadmap", name: "v5" },
				{ template: "sprint", name: "s1" },
			],
		});
		await runProjectStatus({ ...input, issue: "12", status: "Todo" });
		expect(projects.find).toHaveBeenLastCalledWith("acme", "v5");
		await runProjectStatus({ ...input, issue: "12", status: "Todo", board: "s1" });
		expect(projects.find).toHaveBeenLastCalledWith("acme", "s1");
	});

	it("fails for a board that is not declared, listing the declared ones", async () => {
		const { input, lines } = setup([item()]);
		expect((await runProjectStatus({ ...input, issue: "12", status: "Done", board: "x" })).status).toBe("fail");
		expect(lines.join("\n")).toContain("declared boards: v5");
	});

	it("fails when no boards are declared", async () => {
		const projects = fakeProjects({ items: async () => [], setStatus: async () => ({}) });
		const { input, lines } = inputFor(projects);
		expect((await runProjectStatus({ ...input, issue: "12", status: "Done" })).status).toBe("fail");
		expect(lines.join("\n")).toContain("declare them in providers.projects");
	});

	it("is a clear error without providers.projects", async () => {
		const { input } = setup([item()]);
		const err = await runProjectStatus({ ...input, loaded: loadedWith({}), issue: "1", status: "x" }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(ConfigError);
	});

	it("uses the console, the default logger and the file system when none are given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const { input } = setup([item()]);
		const report = await runProjectStatus({
			loaded: input.loaded,
			loader: input.loader,
			context: { repoRoot: "/tmp/holocron-no-such-repo", org: "acme" },
			issue: "12",
			status: "Done",
		});
		expect(report.status).toBe("ok");
		expect(log).toHaveBeenCalledWith("#12 Todo → Done");
		log.mockRestore();
	});

	it("reads a repository-qualified key as foreign when no org is known", async () => {
		const { projects, input } = setup([item()]);
		const loaded = {
			...input.loaded,
			resolved: { ...input.loaded.resolved, org: undefined },
		} as typeof input.loaded;
		const report = await runProjectStatus({
			...input,
			loaded,
			context: { repoRoot: "/tmp/test" },
			owner: "acme",
			issue: "acme/demo#12",
			status: "Done",
		});
		expect(report.status).toBe("fail");
		expect(projects.setStatus).not.toHaveBeenCalled();
	});
});
