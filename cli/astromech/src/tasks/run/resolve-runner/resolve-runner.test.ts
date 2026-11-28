import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveRunner } from "./resolve-runner.js";

const build = {
	detect: [
		{ when: /^tsdown\.config\./, tool: "tsdown" },
		{ when: /^tsconfig\.json$/, tool: "tsc", args: ["-b"] },
	],
};

/** Fakes that only answer for `/r` and `/r/package.json`, so a read or listing from anywhere else fails the test. */
const fs = (files: string[], pkg?: string) => ({
	listDir: (path: string) => {
		if (path !== "/r") throw new Error(`unexpected listing of ${path}`);
		return files;
	},
	readFile: (path: string) => {
		if (path !== join("/r", "package.json")) throw new Error(`unexpected read of ${path}`);
		if (pkg === undefined) throw new Error("ENOENT");
		return pkg;
	},
});
const resolve = (local: Parameters<typeof resolveRunner>[0], files: string[], pkg?: string) => {
	const { listDir, readFile } = fs(files, pkg);
	return resolveRunner(local, "/r", listDir, readFile);
};

describe("resolveRunner", () => {
	it("uses an explicit tool as is", () => {
		expect(resolve({ tool: "vitest", args: ["run"] }, [])).toEqual({ tool: "vitest", args: ["run"] });
		expect(resolve({ tool: "vitest" }, [])).toEqual({ tool: "vitest", args: [] });
	});

	it("picks the first candidate whose config file is present", () => {
		expect(resolve(build, ["tsdown.config.ts", "tsconfig.json"])).toEqual({ tool: "tsdown", args: [] });
	});

	it("matches a candidate by declared dependency when its config file is gone, ahead of a later file match", () => {
		expect(resolve(build, ["tsconfig.json"], '{"devDependencies":{"tsdown":"1"}}')).toEqual({
			tool: "tsdown",
			args: [],
		});
	});

	it("falls to a later candidate by file, and to undefined when nothing matches or the directory is unreadable", () => {
		expect(resolve(build, ["tsconfig.json"])).toEqual({ tool: "tsc", args: ["-b"] });
		expect(resolve(build, ["README.md"])).toBeUndefined();
		const { readFile } = fs([]);
		const unreadable = () => {
			throw new Error("EACCES");
		};
		expect(resolveRunner(build, "/r", unreadable, readFile)).toBeUndefined();
	});
});
