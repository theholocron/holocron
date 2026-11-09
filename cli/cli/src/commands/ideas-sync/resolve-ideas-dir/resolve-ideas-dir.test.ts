import { describe, expect, it } from "vitest";

import { resolveIdeasDir } from "./resolve-ideas-dir.js";

describe("resolveIdeasDir", () => {
	it("is undefined with no config and no variable", () => {
		expect(resolveIdeasDir(undefined, "/home/leia", {})).toBeUndefined();
	});

	it("uses the config's dir as it is when it has no ~", () => {
		expect(resolveIdeasDir({ dir: "/vault" }, "/home/leia", {})).toBe("/vault");
	});

	it("expands a leading ~ to the home folder", () => {
		expect(resolveIdeasDir({ dir: "~/Library/vault" }, "/home/leia", {})).toBe("/home/leia/Library/vault");
		expect(resolveIdeasDir({ dir: "~" }, "/home/leia", {})).toBe("/home/leia");
		expect(resolveIdeasDir({ dir: "~other/x" }, "/home/leia", {})).toBe("~other/x");
	});

	it("lets HOLOCRON_IDEAS_DIR win over the config, and expands it too", () => {
		expect(resolveIdeasDir({ dir: "/vault" }, "/h", { HOLOCRON_IDEAS_DIR: "~/notes" })).toBe("/h/notes");
		expect(resolveIdeasDir(undefined, "/h", { HOLOCRON_IDEAS_DIR: "/only/env" })).toBe("/only/env");
	});

	it("falls back to the bare IDEAS_DIR, and ignores a blank variable", () => {
		expect(resolveIdeasDir({ dir: "/vault" }, "/h", { IDEAS_DIR: "/bare" })).toBe("/bare");
		expect(resolveIdeasDir({ dir: "/vault" }, "/h", { HOLOCRON_IDEAS_DIR: "" })).toBe("/vault");
	});
});
