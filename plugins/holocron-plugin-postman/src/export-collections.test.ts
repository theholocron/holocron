import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportCollections, exportDirNames } from "./export-collections.js";
import type { PostmanCli } from "./shell.js";

let root: string;
beforeEach(() => void (root = mkdtempSync(join(tmpdir(), "postman-export-"))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A CLI that writes what `postman collection migrate` is documented to: a folder of YAML files. */
function fakeCli(write: (outDir: string) => void = (out) => writeLayout(out)) {
	const migrate = vi.fn((_file: string, outDir: string) => write(outDir));
	return { cli: { migrate } as unknown as PostmanCli, migrate };
}

function writeLayout(outDir: string) {
	mkdirSync(join(outDir, "requests"), { recursive: true });
	writeFileSync(join(outDir, "collection.yaml"), "name: x\n");
	writeFileSync(join(outDir, "requests", "ping.yaml"), "name: ping\n");
}

const input = (over: Record<string, unknown> = {}) => ({
	collectionFiles: ["requests/collection.json"],
	envFiles: [],
	outDir: join(root, "out"),
	repoRoot: root,
	...over,
});

describe("exportDirNames", () => {
	it("names a folder after the file, without its extension", () => {
		expect(exportDirNames(["requests/collection.json", "other/two.json"])).toEqual(["collection", "two"]);
	});

	it("uses the whole path when two files share a name", () => {
		expect(exportDirNames(["apps/a/collection.json", "apps/b/collection.json"])).toEqual([
			"apps-a-collection",
			"apps-b-collection",
		]);
	});
});

describe("exportCollections", () => {
	it("migrates each collection into its own folder under outDir and lists what was written", async () => {
		const { cli, migrate } = fakeCli();
		const result = await exportCollections(input(), cli);
		expect(migrate).toHaveBeenCalledWith(join(root, "requests/collection.json"), join(root, "out", "collection"));
		expect(result).toEqual({
			files: ["collection/collection.yaml", "collection/requests/ping.yaml"],
			issues: [],
		});
		expect(readdirSync(join(root, "out", "collection")).sort()).toEqual(["collection.yaml", "requests"]);
	});

	it("reports an environment file as not exported", async () => {
		const { cli } = fakeCli();
		const result = await exportCollections(input({ envFiles: ["requests/environment.json"] }), cli);
		expect(result.issues).toEqual([
			{ file: "requests/environment.json", message: expect.stringContaining("not exported") },
		]);
	});

	it("reports a collection the CLI wrote nothing for", async () => {
		const { cli } = fakeCli(() => undefined);
		const result = await exportCollections(input(), cli);
		expect(result.files).toEqual([]);
		expect(result.issues).toEqual([
			{ file: "requests/collection.json", message: expect.stringContaining("no files") },
		]);
	});

	it("lists the files on a dry run without touching outDir, and removes its temporary folder", async () => {
		const { cli, migrate } = fakeCli();
		const result = await exportCollections(input({ dryRun: true }), cli);
		expect(result.files).toEqual(["collection/collection.yaml", "collection/requests/ping.yaml"]);
		expect(existsSync(join(root, "out"))).toBe(false);
		const used = (migrate.mock.calls[0] as string[])[1] as string;
		expect(used.startsWith(tmpdir())).toBe(true);
		expect(existsSync(used)).toBe(false);
	});

	it("throws what the CLI throws, and still removes the temporary folder of a dry run", async () => {
		let used = "";
		const { cli } = fakeCli((out) => {
			used = out;
			throw new Error("not installed");
		});
		await expect(exportCollections(input({ dryRun: true }), cli)).rejects.toThrow("not installed");
		expect(existsSync(used)).toBe(false);
	});
});
