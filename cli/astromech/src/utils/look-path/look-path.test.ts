import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { realLookPath } from "./look-path.js";

describe.skipIf(process.platform === "win32")("realLookPath", () => {
	let root: string;
	let pathDir: string;
	let savedPath: string | undefined;

	const exe = async (dir: string, name: string) => {
		await mkdir(dir, { recursive: true });
		const file = join(dir, name);
		await writeFile(file, "#!/bin/sh\n");
		await chmod(file, 0o755);
		return file;
	};

	beforeEach(async () => {
		root = await realpath(await mkdtemp(join(tmpdir(), "look-path-")));
		pathDir = join(root, "path");
		savedPath = process.env["PATH"];
		process.env["PATH"] = pathDir;
	});
	afterEach(async () => {
		process.env["PATH"] = savedPath;
		await rm(root, { recursive: true, force: true });
	});

	it("prefers the project's node_modules/.bin over PATH", async () => {
		await exe(pathDir, "tool");
		const local = await exe(join(root, "node_modules", ".bin"), "tool");
		expect(realLookPath(root, "tool")).toBe(local);
	});

	it("falls back to PATH", async () => {
		const onPath = await exe(pathDir, "tool");
		expect(realLookPath(root, "tool")).toBe(onPath);
	});

	it("returns null when the binary is nowhere", () => {
		expect(realLookPath(root, "tool")).toBeNull();
	});
});
