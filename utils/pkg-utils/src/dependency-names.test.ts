import { describe, expect, it } from "vitest";

import { dependencyNames } from "./dependency-names.ts";

describe("dependencyNames", () => {
	const pkg = {
		dependencies: { a: "1" },
		devDependencies: { b: "1", a: "2" },
		peerDependencies: { c: "1" },
		optionalDependencies: { d: "1" },
	};

	it("merges dependencies and devDependencies by default, once each", () => {
		expect([...dependencyNames(pkg)].sort()).toEqual(["a", "b"]);
	});

	it("reads the fields it's given", () => {
		expect([...dependencyNames(pkg, ["peerDependencies", "optionalDependencies"])].sort()).toEqual(["c", "d"]);
	});

	it("is empty for no package, no maps, or a map that isn't an object", () => {
		expect(dependencyNames(undefined).size).toBe(0);
		expect(dependencyNames({}).size).toBe(0);
		expect(dependencyNames({ dependencies: null as never, devDependencies: "x" as never }).size).toBe(0);
		expect(dependencyNames({ dependencies: ["a", "b"] as never }).size).toBe(0);
	});
});
