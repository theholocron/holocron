import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "./build-app.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

describe("buildApp", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "build-app-"));
	});
	afterEach(() => {
		vi.mocked(spawnSync).mockReset();
		rmSync(dir, { recursive: true, force: true });
	});

	const manifest = (scripts?: Record<string, string>) =>
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", ...(scripts ? { scripts } : {}) }));

	it("has nothing to build without a package.json", () => {
		expect(buildApp(dir)).toEqual({ status: "none" });
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it("has nothing to build without a build script", () => {
		manifest();
		expect(buildApp(dir)).toEqual({ status: "none" });
		manifest({ test: "vitest" });
		expect(buildApp(dir)).toEqual({ status: "none" });
	});

	it("runs the build script in the app's folder", () => {
		manifest({ build: "tsdown" });
		vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);
		expect(buildApp(dir)).toEqual({ status: "built" });
		expect(spawnSync).toHaveBeenCalledWith("pnpm", ["run", "build"], { cwd: dir, stdio: "inherit" });
	});

	it("fails with the exit code", () => {
		manifest({ build: "tsdown" });
		vi.mocked(spawnSync).mockReturnValue({ status: 2 } as never);
		expect(buildApp(dir)).toEqual({ status: "fail", message: `\`pnpm run build\` failed in ${dir} (exit 2)` });
	});

	it("fails with the spawn error, or a signal", () => {
		manifest({ build: "tsdown" });
		vi.mocked(spawnSync).mockReturnValue({ status: null, error: new Error("ENOENT") } as never);
		expect(buildApp(dir)).toMatchObject({ status: "fail", message: expect.stringContaining(": ENOENT") });
		vi.mocked(spawnSync).mockReturnValue({ status: null } as never);
		expect(buildApp(dir)).toMatchObject({ message: expect.stringContaining("(exit signal)") });
	});
});
