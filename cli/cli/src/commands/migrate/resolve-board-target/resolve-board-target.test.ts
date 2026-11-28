import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadedWith } from "../migrate.testing.js";
import { resolveBoardTarget } from "./resolve-board-target.js";

const io = (files: Record<string, string>) => ({
	listFiles: async (dir: string) =>
		Object.keys(files)
			.filter((f) => f.startsWith(`${dir}/`))
			.map((f) => f.slice(dir.length + 1)),
	readFile: async (path: string) => files[path] ?? "",
});

describe("resolveBoardTarget", () => {
	it("takes the roadmap built-in and the fallback owner when the config says nothing", async () => {
		const target = await resolveBoardTarget({
			loaded: loadedWith(),
			fallbackOwner: "acme",
			repoRoot: "/x",
			io: io({}),
		});
		expect(target).toMatchObject({ ok: true, owner: "acme", template: { name: "roadmap" } });
	});

	it("takes the owner and template directory of providers.projects, and a template by name", async () => {
		const sprintLike = JSON.stringify({ extends: "roadmap", fields: [{ name: "Size", type: "text" }] });
		const target = await resolveBoardTarget({
			loaded: loadedWith({ projects: ["github", { org: "other", templates: "boards" }] }),
			fallbackOwner: "acme",
			repoRoot: "/x",
			template: "mine",
			io: io({ "boards/mine.json": sprintLike }),
		});
		expect(target).toMatchObject({ ok: true, owner: "other", template: { name: "mine" } });
		expect(
			(target as { template: { fields: Array<{ name: string }> } }).template.fields.map((f) => f.name)
		).toContain("Size");
	});

	it("reads the real file system when given no reader", async () => {
		const root = await mkdtemp(join(tmpdir(), "board-target-"));
		const target = await resolveBoardTarget({
			loaded: loadedWith(),
			fallbackOwner: "acme",
			repoRoot: root,
			template: "sprint",
		});
		await rm(root, { recursive: true, force: true });
		expect(target).toMatchObject({ ok: true, template: { name: "sprint" } });
	});

	it("fails naming the templates there are for one that does not exist", async () => {
		const target = await resolveBoardTarget({
			loaded: loadedWith(),
			fallbackOwner: "acme",
			repoRoot: "/x",
			template: "nope",
			io: io({}),
		});
		expect(target).toEqual({ ok: false, reason: 'no board template "nope"; available: roadmap, sprint' });
	});

	it("fails with every problem of providers.projects options that do not read", async () => {
		const target = await resolveBoardTarget({
			loaded: loadedWith({ projects: ["github", { org: 3 }] }),
			fallbackOwner: "acme",
			repoRoot: "/x",
			io: io({}),
		});
		expect(target).toEqual({ ok: false, reason: "providers.projects: org must be text" });
	});
});
