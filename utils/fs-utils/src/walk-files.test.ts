import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lets a test make the listing report entries of unknown type (as some
// filesystems do) without needing such a filesystem.
const unknownTypes = vi.hoisted(() => ({ on: false, lstatFails: false }));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
			if (unknownTypes.lstatFails) throw new Error("vanished");
			return actual.lstatSync(...args);
		}) as typeof actual.lstatSync,
		readdirSync: ((path: string, options: object) => {
			const entries = (actual.readdirSync as (p: string, o: object) => import("node:fs").Dirent[])(path, options);
			return unknownTypes.on ? entries.map((e) => new actual.Dirent(e.name, 0, e.parentPath)) : entries;
		}) as typeof actual.readdirSync,
	};
});

import { walkFilesSync } from "./walk-files.ts";

describe("walkFilesSync", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "fs-utils-walk-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	async function put(rel: string): Promise<string> {
		const path = join(dir, rel);
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, "");
		return path;
	}

	it("lists every file at any depth, absolute and name-sorted", async () => {
		const b = await put("b.txt");
		const a = await put("a/deep/x.txt");
		const c = await put("a/c.txt");
		expect(walkFilesSync(dir)).toEqual([c, a, b]);
	});

	it("skips .git and node_modules by default, at any depth", async () => {
		const keep = await put("src/index.ts");
		await put(".git/HEAD");
		await put("node_modules/x/index.js");
		await put("packages/p/node_modules/y.js");
		expect(walkFilesSync(dir)).toEqual([keep]);
	});

	it("skips exactly the directory names in options.skip, replacing the defaults", async () => {
		await put("dist/out.js");
		const modules = await put("node_modules/x.js");
		const src = await put("src/a.ts");
		expect(walkFilesSync(dir, { skip: ["dist"] })).toEqual([modules, src]);
		expect(walkFilesSync(dir, { skip: new Set<string>() })).toEqual([join(dir, "dist", "out.js"), modules, src]);
	});

	it("neither follows nor lists symlinks", async () => {
		const real = await put("real/a.txt");
		await symlink(join(dir, "real"), join(dir, "link-to-dir"));
		await symlink(real, join(dir, "link-to-file"));
		await symlink(dir, join(dir, "real", "loop"));
		expect(walkFilesSync(dir)).toEqual([real]);
	});

	it("only skips directories by name: a file called node_modules is still listed", async () => {
		const file = await put("node_modules");
		await put("sub/node_modules/x.js");
		expect(walkFilesSync(dir)).toEqual([file]);
	});

	it("follows the root itself when it is a symlink", async () => {
		await put("real/a.txt");
		await symlink(join(dir, "real"), join(dir, "root-link"));
		expect(walkFilesSync(join(dir, "root-link"))).toEqual([join(dir, "root-link", "a.txt")]);
	});

	it("classifies entries the listing reports as unknown type by asking the filesystem", async () => {
		const file = await put("a/b.txt");
		await put("node_modules/x.js");
		await symlink(file, join(dir, "link"));
		unknownTypes.on = true;
		try {
			expect(walkFilesSync(dir)).toEqual([file]);
		} finally {
			unknownTypes.on = false;
		}
	});

	it("treats an unknown-type entry it can't stat (it vanished mid-walk) as absent", async () => {
		await put("a.txt");
		unknownTypes.on = true;
		unknownTypes.lstatFails = true;
		try {
			expect(walkFilesSync(dir)).toEqual([]);
		} finally {
			unknownTypes.on = false;
			unknownTypes.lstatFails = false;
		}
	});

	it.skipIf(process.getuid?.() === 0)(
		"skips an unreadable subdirectory but throws for an unreadable or missing root",
		async () => {
			const ok = await put("ok/a.txt");
			await put("locked/b.txt");
			await chmod(join(dir, "locked"), 0o000);
			try {
				expect(walkFilesSync(dir)).toEqual([ok]);
			} finally {
				await chmod(join(dir, "locked"), 0o755);
			}
			expect(() => walkFilesSync(join(dir, "missing"))).toThrow(/ENOENT/);
		}
	);

	it("resolves a relative root against the working directory", async () => {
		const a = await put("a.txt");
		const previous = process.cwd();
		process.chdir(dir);
		try {
			expect(walkFilesSync(".").map((p) => p.replace(/^\/private/, ""))).toEqual([a.replace(/^\/private/, "")]);
		} finally {
			process.chdir(previous);
		}
	});
});
