import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findRoot, findRootSync } from "./find-root.ts";

// Both variants must agree, so every case runs against each.
const variants = [
	["findRoot", (...a: Parameters<typeof findRoot>) => findRoot(...a)],
	["findRootSync", async (...a: Parameters<typeof findRoot>) => findRootSync(...a)],
] as const;

describe.each(variants)("%s", (_name, find) => {
	let root: string;
	let nested: string;

	beforeEach(async () => {
		// realpath: macOS tmpdir is itself a symlink (/var -> /private/var)
		root = await realpath(await mkdtemp(join(tmpdir(), "fs-utils-root-")));
		nested = join(root, "a", "b");
		await mkdir(nested, { recursive: true });
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("finds the marker in the start directory itself", async () => {
		await writeFile(join(nested, "marker.txt"), "");
		expect(await find(nested, "marker.txt")).toBe(nested);
	});

	it("finds the marker several levels up", async () => {
		await writeFile(join(root, "marker.txt"), "");
		expect(await find(nested, "marker.txt")).toBe(root);
	});

	it("treats a directory marker like a file marker (.git)", async () => {
		await mkdir(join(root, ".git"));
		expect(await find(nested, ".git")).toBe(root);
	});

	it("returns the nearest match when several ancestors have the marker", async () => {
		await writeFile(join(root, "marker.txt"), "");
		await writeFile(join(root, "a", "marker.txt"), "");
		expect(await find(nested, "marker.txt")).toBe(join(root, "a"));
	});

	it("accepts a list of markers — any one counts", async () => {
		await writeFile(join(root, "a", "turbo.json"), "");
		expect(await find(nested, ["nx.json", "turbo.json"])).toBe(join(root, "a"));
	});

	it("returns undefined when no ancestor has the marker", async () => {
		expect(await find(nested, "definitely-not-a-real-marker-4f9c.txt")).toBeUndefined();
	});

	it('with fallback "start", returns the start directory when nothing is found', async () => {
		expect(await find(nested, "definitely-not-a-real-marker-4f9c.txt", { fallback: "start" })).toBe(nested);
	});

	it("with realpath, resolves a symlinked start directory and walks the physical tree", async () => {
		await writeFile(join(root, "marker.txt"), "");
		const elsewhere = await realpath(await mkdtemp(join(tmpdir(), "fs-utils-link-")));
		try {
			const link = join(elsewhere, "link");
			await symlink(nested, link);
			// the link's lexical ancestors (`elsewhere`) have no marker; the real ones do
			expect(await find(link, "marker.txt")).toBeUndefined();
			expect(await find(link, "marker.txt", { realpath: true })).toBe(root);
		} finally {
			await rm(elsewhere, { recursive: true, force: true });
		}
	});

	it("with realpath, resolves a relative start directory", async () => {
		await writeFile(join(root, "marker.txt"), "");
		const rel = relative(process.cwd(), nested);
		expect(await find(rel, "marker.txt", { realpath: true })).toBe(root);
	});

	it("with realpath, a start path that doesn't exist is not found", async () => {
		const missing = join(root, "nope");
		expect(await find(missing, "marker.txt", { realpath: true })).toBeUndefined();
		expect(await find(missing, "marker.txt", { realpath: true, fallback: "start" })).toBe(missing);
	});

	it("resolves a relative start directory to an absolute path, with or without realpath", async () => {
		const rel = relative(process.cwd(), nested);
		expect(await find(rel, "definitely-not-a-real-marker-4f9c.txt", { fallback: "start" })).toBe(nested);
		const missing = relative(process.cwd(), join(root, "nope"));
		expect(await find(missing, "marker.txt", { realpath: true, fallback: "start" })).toBe(
			resolve(process.cwd(), missing)
		);
	});

	it.each(["", ".", "..", "../x", "a/b", "a\\b", "/abs", "bad\0name"])(
		"rejects marker %j that isn't a single name",
		async (bad) => {
			await expect(Promise.resolve().then(() => find(nested, bad))).rejects.toThrow(TypeError);
			await expect(Promise.resolve().then(() => find(nested, ["ok.txt", bad]))).rejects.toThrow(TypeError);
		}
	);

	it("rejects an empty marker list", async () => {
		await expect(Promise.resolve().then(() => find(nested, []))).rejects.toThrow(TypeError);
	});

	it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
		"propagates a lookup failure that isn't absence (EACCES)",
		async () => {
			await chmod(join(root, "a"), 0o000);
			try {
				await expect(Promise.resolve().then(() => find(nested, "marker.txt"))).rejects.toMatchObject({
					code: "EACCES",
				});
			} finally {
				await chmod(join(root, "a"), 0o755);
			}
		}
	);

	it("propagates a realpath failure that isn't absence (ELOOP)", async () => {
		const loop = join(root, "loop");
		await symlink(loop, loop);
		await expect(Promise.resolve().then(() => find(loop, "marker.txt", { realpath: true }))).rejects.toMatchObject({
			code: "ELOOP",
		});
	});

	it("treats a start path under a regular file as not found (ENOTDIR)", async () => {
		await writeFile(join(root, "file.txt"), "");
		expect(await find(join(root, "file.txt", "sub"), "marker.txt", { realpath: true })).toBeUndefined();
	});
});

describe("findRoot vs findRootSync", () => {
	it("agree on the repo's own .git", async () => {
		expect(await findRoot(__dirname, ".git", { realpath: true })).toBe(
			findRootSync(__dirname, ".git", { realpath: true })
		);
	});
});

describe("findRoot", () => {
	it("does not block on realpath: the start is resolved asynchronously", async () => {
		const p = findRoot(process.cwd(), ".git", { realpath: true });
		expect(p).toBeInstanceOf(Promise);
		await p;
	});

	it("keeps a relative search on the original tree if the cwd changes mid-walk", async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "fs-utils-chdir-")));
		const other = await realpath(await mkdtemp(join(tmpdir(), "fs-utils-chdir-other-")));
		const cwd = process.cwd();
		try {
			await mkdir(join(root, "a"), { recursive: true });
			await writeFile(join(root, "marker.txt"), "");
			process.chdir(root);
			const pending = findRoot("a", "marker.txt");
			process.chdir(other);
			expect(await pending).toBe(root);
		} finally {
			process.chdir(cwd);
			await rm(root, { recursive: true, force: true });
			await rm(other, { recursive: true, force: true });
		}
	});
});
