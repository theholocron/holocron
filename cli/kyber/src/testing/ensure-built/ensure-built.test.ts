import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync }));

import { ensureBuilt, isStale } from "./ensure-built.js";

describe("isStale and ensureBuilt", () => {
	let dir: string;
	const touch = (path: string, secondsAgo: number) => {
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, "x");
		const t = new Date(Date.now() - secondsAgo * 1000);
		utimesSync(path, t, t);
	};

	beforeEach(() => {
		execFileSync.mockClear();
		dir = mkdtempSync(join(tmpdir(), "stale-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("is stale when there is no build", () => {
		touch(join(dir, "src", "a.ts"), 10);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"))).toBe(true);
	});

	it("is stale when a source file is newer than the build, at any depth", () => {
		touch(join(dir, "dist", "cli.mjs"), 10);
		touch(join(dir, "src", "deep", "er", "a.ts"), 1);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"))).toBe(true);
	});

	it("is fresh when the build is newer than every source file, whatever the tests and helpers say", () => {
		touch(join(dir, "src", "a.ts"), 30);
		touch(join(dir, "src", "a.test.ts"), 1);
		touch(join(dir, "src", "testing", "helper.ts"), 1);
		touch(join(dir, "dist", "cli.mjs"), 10);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"))).toBe(false);
	});

	it("counts a folder named in ignoreDirs as no source, and only that one", () => {
		touch(join(dir, "src", "a.ts"), 30);
		touch(join(dir, "src", "fixtures", "x.ts"), 1);
		touch(join(dir, "dist", "cli.mjs"), 10);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"), ["fixtures"])).toBe(false);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"), [])).toBe(true);
	});

	describe("ensureBuilt", () => {
		const bin = () => join(dir, "dist", "cli.mjs");

		it("builds with the function it is given when the build is stale", () => {
			touch(join(dir, "src", "a.ts"), 1);
			const build = vi.fn();
			ensureBuilt({ bin: bin(), srcDir: join(dir, "src"), cwd: dir, build });
			expect(build).toHaveBeenCalledTimes(1);
			expect(execFileSync).not.toHaveBeenCalled();
		});

		it("builds nothing when the build is fresh", () => {
			touch(join(dir, "src", "a.ts"), 30);
			touch(bin(), 10);
			const build = vi.fn();
			ensureBuilt({ bin: bin(), srcDir: join(dir, "src"), cwd: dir, build });
			expect(build).not.toHaveBeenCalled();
			expect(execFileSync).not.toHaveBeenCalled();
		});

		it("runs the package's own tsdown by default", () => {
			touch(join(dir, "src", "a.ts"), 1);
			ensureBuilt({ bin: bin(), srcDir: join(dir, "src"), cwd: dir });
			expect(execFileSync).toHaveBeenCalledExactlyOnceWith(join(dir, "node_modules", ".bin", "tsdown"), {
				cwd: dir,
				stdio: "inherit",
			});
		});
	});
});
