import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Vitest can't spy on a live ESM named export directly ("Module namespace is
// not configurable") -- mock the module with a `stat` that delegates to the
// real implementation by default, so `mockRejectedValueOnce` below can
// override just one call without needing an explicit restore afterward (the
// "once" queue drains after that single call).
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, stat: vi.fn(actual.stat) };
});

import { isWorkspaceRoot } from "./is-workspace-root.ts";

describe("isWorkspaceRoot", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "fs-utils-workspace-root-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("returns true when pnpm-workspace.yaml exists in dir", async () => {
		await writeFile(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		expect(await isWorkspaceRoot(dir)).toBe(true);
	});

	it("returns false when pnpm-workspace.yaml is absent", async () => {
		expect(await isWorkspaceRoot(dir)).toBe(false);
	});

	it("returns false, not a rejection, when dir itself doesn't exist", async () => {
		await expect(isWorkspaceRoot(join(dir, "nonexistent"))).resolves.toBe(false);
	});

	it("returns false when pnpm-workspace.yaml is a directory, not a file", async () => {
		await mkdir(join(dir, "pnpm-workspace.yaml"));
		expect(await isWorkspaceRoot(dir)).toBe(false);
	});

	it("resolves a relative dir against the working directory, not a cwd that changed mid-call", async () => {
		await writeFile(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			const pending = isWorkspaceRoot(".");
			// Simulates another task changing the process-wide cwd while this
			// call's own lookup is still pending -- resolve() up front means
			// this doesn't affect which directory gets checked.
			process.chdir(originalCwd);
			expect(await pending).toBe(true);
		} finally {
			process.chdir(originalCwd);
		}
	});

	it("propagates a filesystem error other than ENOENT instead of reading it as false", async () => {
		const err = Object.assign(new Error("permission denied"), { code: "EACCES" });
		vi.mocked(stat).mockRejectedValueOnce(err);
		await expect(isWorkspaceRoot(dir)).rejects.toMatchObject({ code: "EACCES" });
	});
});
