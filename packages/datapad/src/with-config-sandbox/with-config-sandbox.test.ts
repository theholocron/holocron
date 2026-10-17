import { mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfigFromContent } from "../load-config-from-content/index.js";
import { withConfigSandbox } from "./with-config-sandbox.js";

const exists = (path: string) =>
	stat(path).then(
		() => true,
		() => false
	);

describe("withConfigSandbox", () => {
	let scratch: string;
	let nodeModules: string;

	beforeEach(async () => {
		scratch = await mkdtemp(join(tmpdir(), "datapad-sandbox-test-"));
		nodeModules = join(scratch, "real_node_modules");
		await mkdir(nodeModules);
	});
	afterEach(async () => {
		await rm(scratch, { recursive: true, force: true });
	});

	it("hands run a directory with node_modules symlinked in and an ESM package.json", async () => {
		const seen = await withConfigSandbox({ nodeModules, root: scratch }, async (dir) => ({
			dir,
			link: await readlink(join(dir, "node_modules")),
			pkg: JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as unknown,
		}));
		expect(seen.link).toBe(nodeModules);
		expect(seen.pkg).toEqual({ type: "module" });
	});

	it("returns what run returns, and removes the directory afterwards", async () => {
		let sandbox = "";
		const value = await withConfigSandbox({ nodeModules, root: scratch }, (dir) => {
			sandbox = dir;
			return Promise.resolve(42);
		});
		expect(value).toBe(42);
		expect(await exists(sandbox)).toBe(false);
		expect(await exists(nodeModules)).toBe(true); // the symlink target is left alone
	});

	it("removes the directory and rethrows when run throws", async () => {
		let sandbox = "";
		const err = await withConfigSandbox({ nodeModules, root: scratch }, (dir) => {
			sandbox = dir;
			return Promise.reject(new Error("boom"));
		}).catch((e: unknown) => e);
		expect((err as Error).message).toBe("boom");
		expect(await exists(sandbox)).toBe(false);
	});

	it("creates the directory under root with the given prefix, making root if needed", async () => {
		const root = join(scratch, "nested", "root");
		const dir = await withConfigSandbox({ nodeModules, root, prefix: "mine-" }, (d) => Promise.resolve(d));
		expect(dirname(dir)).toBe(root);
		expect(basename(dir)).toMatch(/^mine-/);
	});

	it("defaults to the OS temp dir", async () => {
		const dir = await withConfigSandbox({ nodeModules }, (d) => Promise.resolve(d));
		expect(dirname(dir)).toBe(tmpdir());
		expect(basename(dir)).toMatch(/^datapad-/);
	});

	it("loads a config that imports a package through the symlinked node_modules", async () => {
		await mkdir(join(nodeModules, "fake-dep"));
		await writeFile(
			join(nodeModules, "fake-dep", "package.json"),
			'{"name":"fake-dep","type":"module","main":"index.js"}'
		);
		await writeFile(join(nodeModules, "fake-dep", "index.js"), 'export const name = "from-dep";');
		const loaded = await withConfigSandbox({ nodeModules, root: scratch }, (dir) =>
			loadConfigFromContent<{ name: string }>({
				dir,
				name: "app",
				extension: "js",
				content: 'import { name } from "fake-dep"; export default { name };',
			})
		);
		expect(loaded.config).toEqual({ name: "from-dep" });
	});

	it("cleans up the directory if the symlink can't be made", async () => {
		const blocked = join(scratch, "no-such-parent", "node_modules");
		// symlink() itself succeeds for a dangling target, so break mkdtemp instead: root is a file.
		const file = join(scratch, "a-file");
		await writeFile(file, "");
		await expect(
			withConfigSandbox({ nodeModules: blocked, root: file }, () => Promise.resolve())
		).rejects.toThrow();
	});
});
