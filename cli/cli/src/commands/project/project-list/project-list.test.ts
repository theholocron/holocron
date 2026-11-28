import { describe, expect, it, vi } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { board, fakeProjects, inputFor, loadedWith } from "../project-test-kit/index.js";
import { runProjectList } from "./project-list.js";

describe("list projects", () => {
	it("prints the boards newest first with their state", async () => {
		const projects = fakeProjects({
			list: async () => [board({ number: 3, name: "old", closed: true }), board({ number: 7, name: "v5" })],
		});
		const { input, lines } = inputFor(projects);
		const report = await runProjectList(input);
		const text = lines.join("\n");
		expect(report.status).toBe("ok");
		expect(text.indexOf("v5")).toBeLessThan(text.indexOf("old"));
		expect(text).toMatch(/3\s+old\s+closed/);
		expect(projects.list).toHaveBeenCalledWith("acme");
	});

	it("says so when there are no boards", async () => {
		const { input, lines } = inputFor(fakeProjects());
		await runProjectList(input);
		expect(lines.join("\n")).toContain("no boards");
	});

	it("fails the run when the provider throws", async () => {
		const { input, lines } = inputFor(
			fakeProjects({
				list: async () => {
					throw new Error("boom");
				},
			})
		);
		expect((await runProjectList(input)).status).toBe("fail");
		expect(lines.join("\n")).toContain("boom");
	});

	it("is a clear error without providers.projects", async () => {
		const { input } = inputFor(fakeProjects());
		const err = await runProjectList({ ...input, loaded: loadedWith({}) }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/needs a `projects` provider/);
	});

	it("takes the owner from the flag over the config", async () => {
		const projects = fakeProjects();
		const { input } = inputFor(projects);
		await runProjectList({ ...input, owner: "other" });
		expect(projects.list).toHaveBeenCalledWith("other");
	});

	it("uses the console and the default logger when none are given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const projects = fakeProjects({
			list: async () => [
				board({ number: undefined as never, name: "loose" }),
				board({ number: 12, name: "v12" }),
			],
		});
		const { input } = inputFor(projects);
		const report = await runProjectList({ loaded: input.loaded, loader: input.loader, context: input.context });
		const text = log.mock.calls.flat().join("\n");
		expect(report.status).toBe("ok");
		expect(text).toMatch(/-\s+loose\s+open/);
		expect(text.indexOf("v12")).toBeLessThan(text.indexOf("loose"));
		expect(text).toContain("2 boards");
		log.mockRestore();
	});

	it("says board in the singular", async () => {
		const { input, lines } = inputFor(fakeProjects({ list: async () => [board()] }));
		await runProjectList(input);
		expect(lines.join("\n")).toMatch(/1 board\b(?!s)/);
	});

	it("keeps boards without a number in order", async () => {
		const { input, lines } = inputFor(
			fakeProjects({
				list: async () => [
					board({ number: undefined as never, name: "a" }),
					board({ number: undefined as never, name: "b" }),
				],
			})
		);
		expect((await runProjectList(input)).status).toBe("ok");
		expect(lines.join("\n")).toMatch(/-\s+a\s+open[\s\S]*-\s+b\s+open/);
	});
});
