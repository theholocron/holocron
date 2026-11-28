import { describe, expect, it, vi } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { board, fakeProjects, inputFor, loadedWith, memoryIo } from "../project-test-kit/index.js";
import { runProjectSetup } from "./project-setup.js";

const declared = [{ template: "roadmap", name: "v5" }];

describe("setup project", () => {
	it("creates a missing board, then ensures it", async () => {
		const projects = fakeProjects({
			ensure: async () => ({ created: false, changes: ["status Blocked added"], todos: [] }),
		});
		const { input, lines } = inputFor(projects, { boards: declared });
		const report = await runProjectSetup(input);
		expect(report.status).toBe("ok");
		expect(projects.create).toHaveBeenCalledWith("acme", "v5", expect.objectContaining({ name: "roadmap" }));
		expect(projects.ensure).toHaveBeenCalled();
		expect(lines.join("\n")).toContain("status Blocked added");
	});

	it("only ensures a board that exists", async () => {
		const projects = fakeProjects({ find: async () => board() });
		const { input, lines } = inputFor(projects, { boards: declared });
		expect((await runProjectSetup(input)).status).toBe("ok");
		expect(projects.create).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("already matches");
	});

	it("fails the run on a todo", async () => {
		const projects = fakeProjects({
			find: async () => board(),
			ensure: async () => ({ created: false, changes: [], todos: ['turn on the rule "Item closed"'] }),
		});
		const { input, lines } = inputFor(projects, { boards: declared });
		const report = await runProjectSetup(input);
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toContain('turn on the rule "Item closed"');
	});

	it("goes on to the next board after one fails", async () => {
		const projects = fakeProjects({
			find: async (_o: string, name: string) => {
				if (name === "a") throw new Error("boom");
				return board({ name });
			},
		});
		const { input, lines } = inputFor(projects, {
			boards: [
				{ template: "roadmap", name: "a" },
				{ template: "sprint", name: "b" },
			],
		});
		const report = await runProjectSetup(input);
		expect(report.status).toBe("fail");
		expect(report.summary).toMatchObject({ ok: 1, fail: 1 });
		expect(projects.ensure).toHaveBeenCalledTimes(1);
		expect(lines.join("\n")).toContain("boom");
	});

	it("fails a board whose template does not exist and keeps going", async () => {
		const projects = fakeProjects({ find: async () => board() });
		const { input } = inputFor(projects, {
			boards: [
				{ template: "nope", name: "a" },
				{ template: "sprint", name: "b" },
			],
		});
		const report = await runProjectSetup(input);
		expect(report.summary.fail).toBe(1);
		expect(projects.ensure).toHaveBeenCalledTimes(1);
	});

	it("dry run calls no mutator", async () => {
		const missing = fakeProjects();
		const a = inputFor(missing, { boards: declared, dryRun: true });
		expect((await runProjectSetup(a.input)).status).toBe("ok");
		expect(a.lines.join("\n")).toContain("would create");

		const present = fakeProjects({ find: async () => board() });
		const b = inputFor(present, { boards: declared, dryRun: true });
		await runProjectSetup(b.input);
		for (const p of [missing, present]) {
			expect(p.create).not.toHaveBeenCalled();
			expect(p.ensure).not.toHaveBeenCalled();
		}
	});

	it("skips a provider that cannot ensure", async () => {
		const projects = fakeProjects({ find: async () => board(), ensure: undefined });
		const { input } = inputFor(projects, { boards: declared });
		const report = await runProjectSetup(input);
		expect(report).toMatchObject({ status: "ok", summary: { skip: 1 } });
	});

	it("skips when no boards are declared", async () => {
		const { input } = inputFor(fakeProjects());
		expect(await runProjectSetup(input)).toMatchObject({ status: "ok", summary: { skip: 1 } });
	});

	it("is a clear error without providers.projects", async () => {
		const { input } = inputFor(fakeProjects());
		const err = await runProjectSetup({ ...input, loaded: loadedWith({}) }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
	});

	it("is a clear error for wrong options", async () => {
		const { input } = inputFor(fakeProjects());
		const loaded = loadedWith({ projects: ["github", { boards: "x" }] });
		const err = await runProjectSetup({ ...input, loaded }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/boards must be a list/);
	});

	it("uses the console, the default logger and the file system when none are given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const projects = fakeProjects({ ensure: async () => ({ created: false, changes: [], todos: [] }) });
		const { input } = inputFor(projects, { boards: declared });
		const report = await runProjectSetup({
			loaded: input.loaded,
			loader: input.loader,
			context: { repoRoot: "/tmp/holocron-no-such-repo", org: "acme" },
		});
		expect(report.status).toBe("ok");
		expect(projects.create).toHaveBeenCalled();
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("reports a template file that does not load", async () => {
		const { input, lines } = inputFor(fakeProjects(), { boards: declared });
		const report = await runProjectSetup({ ...input, io: memoryIo({ "broken.json": "{" }) });
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toContain("broken.json");
	});
});
