import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadTemplates } from "../load-templates/index.js";
import { createFsTemplatesIo } from "./fs-templates-io.js";

describe("createFsTemplatesIo", () => {
	it("lists and reads files relative to the repo root", async () => {
		const root = await mkdtemp(join(tmpdir(), "holocron-projects-"));
		await mkdir(join(root, ".holocron/projects"), { recursive: true });
		await writeFile(
			join(root, ".holocron/projects/mine.json"),
			JSON.stringify({ extends: "roadmap", fields: [{ name: "Team", type: "text" }] })
		);
		const loaded = await loadTemplates(".holocron/projects", createFsTemplatesIo(root));
		expect(loaded.problems).toEqual([]);
		expect(loaded.templates["mine"]?.fields.map((f) => f.name)).toContain("Team");
	});

	it("rethrows a failure that is not a missing directory", async () => {
		const root = await mkdtemp(join(tmpdir(), "holocron-projects-"));
		await writeFile(join(root, "file.txt"), "x");
		await expect(createFsTemplatesIo(root).listFiles("file.txt")).rejects.toMatchObject({ code: "ENOTDIR" });
	});

	it("treats a missing directory as empty", async () => {
		const root = await mkdtemp(join(tmpdir(), "holocron-projects-"));
		expect(await createFsTemplatesIo(root).listFiles(".holocron/projects")).toEqual([]);
	});
});
