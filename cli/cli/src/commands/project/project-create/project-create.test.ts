import { describe, expect, it, vi } from "vitest";

import { NonInteractiveError } from "../../../ui/index.js";
import { board, fakeProjects, inputFor, memoryIo, promptOf } from "../project-test-kit/index.js";
import { runProjectCreate } from "./project-create.js";

describe("project create", () => {
	it("makes the board from the template and prints it", async () => {
		const projects = fakeProjects();
		const { input, lines } = inputFor(projects);
		const report = await runProjectCreate({ ...input, template: "roadmap", title: "v5" });
		expect(report).toMatchObject({ status: "ok", created: true });
		expect(projects.create).toHaveBeenCalledWith("acme", "v5", expect.objectContaining({ name: "roadmap" }));
		expect(lines.join("\n")).toContain("Template: roadmap");
	});

	it("titles the board after the template by default", async () => {
		const projects = fakeProjects();
		const { input } = inputFor(projects);
		await runProjectCreate({ ...input, template: "sprint" });
		expect(projects.create).toHaveBeenCalledWith("acme", "sprint", expect.anything());
	});

	it("uses a template file of the repo", async () => {
		const projects = fakeProjects();
		const { input } = inputFor(projects);
		const file = JSON.stringify({ extends: "roadmap", fields: [{ name: "Team", type: "text" }] });
		await runProjectCreate({ ...input, io: memoryIo({ "mine.json": file }), template: "mine" });
		expect(projects.create).toHaveBeenCalledWith(
			"acme",
			"mine",
			expect.objectContaining({ fields: expect.arrayContaining([{ name: "Team", type: "text" }]) })
		);
	});

	it("fails on an unknown template without calling the provider", async () => {
		const projects = fakeProjects();
		const { input, lines } = inputFor(projects);
		expect((await runProjectCreate({ ...input, template: "nope" })).status).toBe("fail");
		expect(lines.join("\n")).toContain("available: roadmap, sprint");
		expect(projects.create).not.toHaveBeenCalled();
	});

	it("picks the template in a terminal when none is given", async () => {
		const projects = fakeProjects();
		const { input } = inputFor(projects);
		const prompt = promptOf({ select: vi.fn(async () => "sprint") });
		await runProjectCreate({ ...input, prompt });
		expect(projects.create).toHaveBeenCalledWith("acme", "sprint", expect.anything());
	});

	it("needs a template when there is no terminal", async () => {
		const { input } = inputFor(fakeProjects());
		const err = await runProjectCreate({ ...input, prompt: promptOf({ interactive: false }) }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("dry run creates nothing", async () => {
		const projects = fakeProjects();
		const { input, lines } = inputFor(projects, { dryRun: true });
		const report = await runProjectCreate({ ...input, template: "roadmap", title: "v5" });
		expect(report).toMatchObject({ status: "ok", created: false });
		expect(lines.join("\n")).toContain("would create");
		expect(projects.create).not.toHaveBeenCalled();
	});

	describe("when an open board has the title", () => {
		const existing = board({ number: 5, name: "v5" });

		it("prints its address with --yes", async () => {
			const projects = fakeProjects({ find: async () => existing });
			const { input, lines } = inputFor(projects);
			const report = await runProjectCreate({ ...input, template: "roadmap", title: "v5", yes: true });
			expect(report).toMatchObject({ status: "ok", created: false, board: existing });
			expect(lines.join("\n")).toContain(existing.url);
			expect(projects.create).not.toHaveBeenCalled();
		});

		it("asks in a terminal and does not create", async () => {
			const projects = fakeProjects({ find: async () => existing });
			const { input } = inputFor(projects);
			const prompt = promptOf();
			await runProjectCreate({ ...input, prompt, template: "roadmap", title: "v5" });
			expect(prompt.confirm).toHaveBeenCalledWith(expect.stringContaining("#5"), true);
			expect(projects.create).not.toHaveBeenCalled();
		});

		it("is a NonInteractiveError without a terminal or --yes", async () => {
			const projects = fakeProjects({ find: async () => existing });
			const { input } = inputFor(projects);
			const err = await runProjectCreate({
				...input,
				prompt: promptOf({ interactive: false }),
				template: "roadmap",
				title: "v5",
			}).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
			expect(projects.create).not.toHaveBeenCalled();
		});
	});

	it("fails the run when the provider throws", async () => {
		const projects = fakeProjects({
			create: async () => {
				throw new Error("denied");
			},
		});
		const { input, lines } = inputFor(projects);
		expect((await runProjectCreate({ ...input, template: "roadmap" })).status).toBe("fail");
		expect(lines.join("\n")).toContain("denied");
	});
});
