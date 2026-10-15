import { describe, expect, it } from "vitest";

import { resolveRunner } from "./resolve-runner.js";

const build = {
	detect: [
		{ when: /^tsdown\.config\./, tool: "tsdown" },
		{ when: /^tsconfig\.json$/, tool: "tsc", args: ["-b"] },
	],
};
const noPkg = () => {
	throw new Error("ENOENT");
};

describe("resolveRunner", () => {
	it("uses an explicit tool as is", () => {
		expect(resolveRunner({ tool: "vitest", args: ["run"] }, "/r", () => [], noPkg)).toEqual({
			tool: "vitest",
			args: ["run"],
		});
		expect(resolveRunner({ tool: "vitest" }, "/r", () => [], noPkg)).toEqual({ tool: "vitest", args: [] });
	});

	it("picks the first candidate whose config file is present", () => {
		expect(resolveRunner(build, "/r", () => ["tsdown.config.ts", "tsconfig.json"], noPkg)).toEqual({
			tool: "tsdown",
			args: [],
		});
	});

	it("matches a candidate by declared dependency when its config file is gone, ahead of a later file match", () => {
		const readFile = () => '{"devDependencies":{"tsdown":"1"}}';
		expect(resolveRunner(build, "/r", () => ["tsconfig.json"], readFile)).toEqual({ tool: "tsdown", args: [] });
	});

	it("falls to a later candidate by file, and to undefined when nothing matches or the directory is unreadable", () => {
		expect(resolveRunner(build, "/r", () => ["tsconfig.json"], noPkg)).toEqual({ tool: "tsc", args: ["-b"] });
		expect(resolveRunner(build, "/r", () => ["README.md"], noPkg)).toBeUndefined();
		expect(
			resolveRunner(
				build,
				"/r",
				() => {
					throw new Error("EACCES");
				},
				noPkg
			)
		).toBeUndefined();
	});
});
