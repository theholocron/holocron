import { describe, expect, it, vi } from "vitest";

import type { BoardItem, Projects } from "../../../plugin/index.js";
import { board, fakeProjects, loadedWith, loaderWith, memoryIo } from "../../project/testing/fake-projects.js";
import { readIssueBoards } from "./issue-boards.js";

const context = { repoRoot: "/tmp/test" };
const item = (key: string): BoardItem => ({ key, title: key, open: true, blockedBy: [] });

async function read(over: Partial<Projects>, boards: unknown[], keys: string[], noProvider = false) {
	const loaded = loadedWith({ projects: ["github", { boards }] });
	const loader = loaderWith(loaded, noProvider ? {} : { projects: fakeProjects(over) });
	await loader.load();
	return readIssueBoards({ loaded, context, loader, keys, templatesIo: memoryIo() });
}

const declared = [
	{ template: "roadmap", name: "v5" },
	{ template: "roadmap", name: "v6" },
];

describe("readIssueBoards", () => {
	it("lists the declared boards that hold the issue, by number in this repository", async () => {
		const items = vi.fn(async (_o: string, b: { name: string }) =>
			b.name === "v5" ? [item("#2500"), item("other/repo#1")] : [item("other/repo#2500")]
		);
		const result = await read({ find: vi.fn(async (_o, name) => board(name)), items }, declared, ["2500"]);
		expect(result).toEqual({ boards: ["v5"] });
	});

	it("matches a repository-qualified key, a qualified item of this repository and a tracker's own key", async () => {
		const items = vi.fn(async () => [item("acme/demo#7"), item("ENG-42")]);
		const find = vi.fn(async (_o: string, name: string) => board(name));
		expect((await read({ find, items }, [declared[0]], ["#7"])).boards).toEqual(["v5"]);
		expect((await read({ find, items }, [declared[0]], ["other/x#7"])).boards).toEqual([]);
		expect((await read({ find, items }, [declared[0]], ["eng-42"])).boards).toEqual(["v5"]);
		expect((await read({ find, items }, [declared[0]], ["ENG-43", "#9"])).boards).toEqual([]);
	});

	it("takes this repository's owner from the context, then from nothing, when the config names no org", async () => {
		const base = loadedWith({ projects: ["github", { org: "acme", boards: [declared[0]] }] });
		const loaded = { ...base, resolved: { ...base.resolved, org: undefined } };
		const caps = {
			projects: fakeProjects({
				find: vi.fn(async (_o, name) => board(name)),
				items: vi.fn(async () => [item("acme/demo#5")]),
			}),
		};
		const loader = loaderWith(loaded, caps);
		await loader.load();
		const keys = ["5"];
		const withOrg = await readIssueBoards({
			loaded,
			context: { ...context, org: "acme" },
			loader,
			keys,
			templatesIo: memoryIo(),
		});
		expect(withOrg.boards).toEqual(["v5"]);
		const without = await readIssueBoards({ loaded, context, loader, keys, templatesIo: memoryIo() });
		expect(without.boards).toEqual([]);
	});

	it("reports a missing provider as a problem", async () => {
		const result = await read({}, declared, ["1"], true);
		expect(result.boards).toEqual([]);
		expect(result.problem).toMatch(/projects/);
	});

	it("reports a provider that cannot list items", async () => {
		const result = await read({}, declared, ["1"]);
		expect(result).toEqual({ boards: [], problem: "the `github` provider cannot list a board's items" });
	});

	it("reports invalid projects options", async () => {
		const loaded = loadedWith({ projects: ["github", { boards: "nope" }] });
		const loader = loaderWith(loaded, { projects: fakeProjects() });
		await loader.load();
		const result = await readIssueBoards({ loaded, context, loader, keys: ["1"], templatesIo: memoryIo() });
		expect(result.boards).toEqual([]);
		expect(result.problem).toContain("not valid");
	});

	it("names a board with no template, a board that is not there and a board that fails, and goes on", async () => {
		const find = vi.fn(async (_o: string, name: string) => {
			if (name === "gone") return undefined;
			if (name === "broken") throw new Error("token refused");
			return board(name);
		});
		const items = vi.fn(async () => [item("#1")]);
		const result = await read(
			{ find, items },
			[
				{ template: "nope", name: "a" },
				{ template: "roadmap", name: "gone" },
				{ template: "roadmap", name: "broken" },
				{ template: "roadmap", name: "ok" },
			],
			["1"]
		);
		expect(result.boards).toEqual(["ok"]);
		expect(result.problem).toContain('board a: there is no template named "nope"');
		expect(result.problem).toContain("board gone: it does not exist or is closed");
		expect(result.problem).toContain("board broken: token refused");
	});

	it("reads the template files from the real file system when no io is given", async () => {
		const loaded = loadedWith({ projects: ["github", { boards: [] }] });
		const loader = loaderWith(loaded, { projects: fakeProjects({ items: vi.fn(async () => []) }) });
		await loader.load();
		const result = await readIssueBoards({
			loaded,
			context: { repoRoot: "/nonexistent-root" },
			loader,
			keys: ["1"],
		});
		expect(result).toEqual({ boards: [] });
	});
});
