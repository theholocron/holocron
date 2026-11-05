import { describe, expect, it, vi } from "vitest";

import { NonInteractiveError } from "../../../ui/index.js";
import { board, fakeProjects, inputFor, promptOf } from "../project-test-kit/index.js";
import { runProjectClose } from "./project-close.js";

const boards = [board({ number: 7, name: "v5" }), board({ number: 4, name: "v4", closed: true })];
const withBoards = () => fakeProjects({ list: async () => boards });

describe("project close", () => {
	it("closes an open board by number after confirming", async () => {
		const projects = withBoards();
		const { input } = inputFor(projects);
		const prompt = promptOf();
		const report = await runProjectClose({ ...input, prompt, board: "7" });
		expect(report).toMatchObject({ status: "ok", closed: true });
		expect(prompt.confirm).toHaveBeenCalledWith(expect.stringContaining("#7"), false);
		expect(projects.close).toHaveBeenCalledWith("acme", boards[0]);
	});

	it("finds a board by name, and --yes skips the question", async () => {
		const projects = withBoards();
		const { input } = inputFor(projects);
		const prompt = promptOf({ confirm: vi.fn() });
		await runProjectClose({ ...input, prompt, board: "v5", yes: true });
		expect(prompt.confirm).not.toHaveBeenCalled();
		expect(projects.close).toHaveBeenCalled();
	});

	it("keeps the board open when the answer is no", async () => {
		const projects = withBoards();
		const { input } = inputFor(projects);
		const prompt = promptOf({ confirm: vi.fn(async () => false) });
		const report = await runProjectClose({ ...input, prompt, board: "7" });
		expect(report).toMatchObject({ status: "ok", closed: false });
		expect(projects.close).not.toHaveBeenCalled();
	});

	it("does not find a closed board", async () => {
		const projects = withBoards();
		const { input } = inputFor(projects);
		expect((await runProjectClose({ ...input, board: "4", yes: true })).status).toBe("fail");
		expect(projects.close).not.toHaveBeenCalled();
	});

	it("needs --yes without a terminal", async () => {
		const projects = withBoards();
		const { input } = inputFor(projects);
		const err = await runProjectClose({ ...input, prompt: promptOf({ interactive: false }), board: "7" }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(projects.close).not.toHaveBeenCalled();
	});

	it("dry run closes nothing", async () => {
		const projects = withBoards();
		const { input, lines } = inputFor(projects, { dryRun: true });
		await runProjectClose({ ...input, board: "7" });
		expect(lines.join("\n")).toContain("would close");
		expect(projects.close).not.toHaveBeenCalled();
	});

	it("fails the run when closing throws", async () => {
		const projects = fakeProjects({
			list: async () => boards,
			close: async () => {
				throw new Error("nope");
			},
		});
		const { input } = inputFor(projects);
		expect((await runProjectClose({ ...input, board: "7", yes: true })).status).toBe("fail");
	});
});
