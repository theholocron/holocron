import { describe, expect, it, vi } from "vitest";

import { fakeProjects, loadedWith, loaderWith, memoryIo } from "../testing/fake-projects.js";
import { openBoardContext } from "./board-context.js";

const context = { repoRoot: "/tmp/test" };

describe("openBoardContext", () => {
	it("returns the provider, the owner from the config's org, the boards and the templates", async () => {
		const loaded = loadedWith({ projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }] });
		const projects = fakeProjects();
		const loader = loaderWith(loaded, { projects });
		await loader.load();
		const result = await openBoardContext({ loaded, context, loader, io: memoryIo() });
		expect(result.ok).toBe(true);
		const ctx = (result as { context: { owner: string; boards: unknown; templates: Record<string, unknown> } })
			.context;
		expect(ctx.owner).toBe("acme");
		expect(ctx.boards).toEqual([{ template: "roadmap", name: "v5" }]);
		expect(Object.keys(ctx.templates)).toEqual(expect.arrayContaining(["roadmap", "sprint"]));
	});

	it("takes the owner from the org option", async () => {
		const loaded = loadedWith({ projects: ["github", { org: "other" }] });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		const result = await openBoardContext({ loaded, context, loader, io: memoryIo() });
		expect((result as { context: { owner: string } }).context.owner).toBe("other");
	});

	it("works with the short form of the provider entry", async () => {
		const loaded = loadedWith({ projects: "github" });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		const result = await openBoardContext({ loaded, context, loader, io: memoryIo() });
		expect((result as { context: { boards: unknown } }).context.boards).toEqual([]);
	});

	it("skips, with the reason, when a configured provider failed to load", async () => {
		const loaded = loadedWith({ projects: "github" });
		const loader = loaderWith(loaded, { projects: undefined });
		vi.spyOn(loader, "loadFailures").mockReturnValue([
			{ key: "projects", provider: "github", packageName: "x", error: new Error("no token") },
		] as never);
		vi.spyOn(loader, "has").mockReturnValue(false);
		const result = await openBoardContext({ loaded, context, loader, io: memoryIo() });
		expect(result).toMatchObject({ ok: false, kind: "skip" });
		expect((result as { reason: string }).reason).toContain("failed to load: no token");
	});

	it("uses the default options when the loader has a provider the config does not list", async () => {
		const loaded = loadedWith({}, { org: undefined });
		const projects = fakeProjects();
		const loader = { has: () => true, get: () => projects, loadFailures: () => [] } as never;
		const result = await openBoardContext({
			loaded,
			context: { ...context, org: "ctx-org" },
			loader,
			io: memoryIo(),
		});
		expect(result).toMatchObject({ ok: true, context: { owner: "ctx-org", boards: [] } });
	});

	it("takes the owner from the run context when the config has no org, and uses an empty owner with none at all", async () => {
		const loaded = loadedWith({ projects: "github" }, { org: undefined });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		const fromContext = await openBoardContext({
			loaded,
			context: { ...context, org: "ctx-org" },
			loader,
			io: memoryIo(),
		});
		expect(fromContext).toMatchObject({ ok: true, context: { owner: "ctx-org" } });
		const none = await openBoardContext({ loaded, context, loader, io: memoryIo() });
		expect(none).toMatchObject({ ok: true, context: { owner: "" } });
	});

	it("reads templates from the repo's file system when no io is given", async () => {
		const loaded = loadedWith({ projects: "github" });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		const result = await openBoardContext({ loaded, context: { repoRoot: "/tmp/holocron-no-such-repo" }, loader });
		expect(result).toMatchObject({ ok: true, context: { templateProblems: [] } });
	});

	it("keeps loading the other providers when one package is missing", async () => {
		const loaded = loadedWith({ projects: "github", notifications: ["discord"] });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		expect(loader.has("projects")).toBe(true);
		expect(loader.has("notifications")).toBe(false);
	});

	it("fails with every problem when the options do not read", async () => {
		const loaded = loadedWith({ projects: ["github", { boards: "nope", templates: 3 }] });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		const result = await openBoardContext({ loaded, context, loader, io: memoryIo() });
		expect(result).toMatchObject({ ok: false, kind: "fail" });
		expect((result as { problems: string[] }).problems).toHaveLength(2);
	});
});
