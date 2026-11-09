import { describe, expect, it } from "vitest";

import { resolveIdeasDir } from "./resolve-ideas-dir.js";

describe("resolveIdeasDir", () => {
	it("is undefined with no config and no variable", () => {
		expect(resolveIdeasDir(undefined, "/home/leia", {})).toBeUndefined();
	});

	it("uses the config's dir as it is when it has no ~", () => {
		expect(resolveIdeasDir("/vault", "/home/leia", {})).toBe("/vault");
	});

	it("expands a leading ~ to the home folder", () => {
		expect(resolveIdeasDir("~/Library/vault", "/home/leia", {})).toBe("/home/leia/Library/vault");
		expect(resolveIdeasDir("~", "/home/leia", {})).toBe("/home/leia");
		expect(resolveIdeasDir("~other/x", "/home/leia", {})).toBe("~other/x");
	});

	it("lets HOLOCRON_IDEAS_DIR win over the config, and expands it too", () => {
		expect(resolveIdeasDir("/vault", "/h", { HOLOCRON_IDEAS_DIR: "~/notes" })).toBe("/h/notes");
		expect(resolveIdeasDir(undefined, "/h", { HOLOCRON_IDEAS_DIR: "/only/env" })).toBe("/only/env");
	});

	it("falls back to the bare IDEAS_DIR, and ignores a blank variable", () => {
		expect(resolveIdeasDir("/vault", "/h", { IDEAS_DIR: "/bare" })).toBe("/bare");
		expect(resolveIdeasDir("/vault", "/h", { HOLOCRON_IDEAS_DIR: "" })).toBe("/vault");
	});
});
