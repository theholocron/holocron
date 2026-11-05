import { describe, expect, it } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { board, fakeProjects, inputFor, loadedWith } from "../project-test-kit/index.js";
import { runProjectList } from "./project-list.js";

describe("project list", () => {
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
});
