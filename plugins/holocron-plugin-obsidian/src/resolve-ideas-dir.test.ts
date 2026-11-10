import { ConfigError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { ICLOUD_VAULTS_ROOT, resolveIdeasDir } from "./resolve-ideas-dir.js";

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

	it("builds the iCloud folder from a vault name, under the given home", () => {
		expect(resolveIdeasDir(undefined, "/home/leia", {}, "The Holocron")).toBe(
			"/home/leia/Library/Mobile Documents/iCloud~md~obsidian/Documents/The Holocron"
		);
		expect(ICLOUD_VAULTS_ROOT).toBe("Library/Mobile Documents/iCloud~md~obsidian/Documents");
	});

	it("lets dir beat vault, and the variable beat both", () => {
		expect(resolveIdeasDir("~/notes", "/h", {}, "The Holocron")).toBe("/h/notes");
		expect(resolveIdeasDir("/vault", "/h", { HOLOCRON_IDEAS_DIR: "~/env" }, "The Holocron")).toBe("/h/env");
	});

	it.each(["", "   ", "a/b", "a\\b", ".", "..", "../x", "/abs"])(
		"rejects the vault %j with a ConfigError naming the path",
		(v) => {
			const err = (() => {
				try {
					resolveIdeasDir(undefined, "/h", {}, v);
				} catch (e) {
					return e;
				}
			})();
			expect(err).toBeInstanceOf(ConfigError);
			expect((err as Error).message).toContain("providers.ideas.vault");
		}
	);

	it("rejects a vault that is not a string, even when dir wins", () => {
		expect(() => resolveIdeasDir("/vault", "/h", {}, 5 as unknown as string)).toThrow(ConfigError);
		expect(() => resolveIdeasDir("/vault", "/h", {}, "a/b")).toThrow(ConfigError);
	});

	it("falls back to the bare IDEAS_DIR, and ignores a blank variable", () => {
		expect(resolveIdeasDir("/vault", "/h", { IDEAS_DIR: "/bare" })).toBe("/bare");
		expect(resolveIdeasDir("/vault", "/h", { HOLOCRON_IDEAS_DIR: "" })).toBe("/vault");
	});
});
