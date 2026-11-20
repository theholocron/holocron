import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { readGitConfig } from "./read-git-config.js";

describe("readGitConfig", () => {
	it("asks git for the key in the directory", () => {
		const run = vi.fn(() => "octo");
		expect(readGitConfig("/r", "github.user", run)).toBe("octo");
		expect(run).toHaveBeenCalledWith(["config", "--get", "github.user"], "/r");
	});

	it("gives undefined for an empty answer or a git failure", () => {
		expect(readGitConfig("/r", "k", () => "")).toBeUndefined();
		expect(
			readGitConfig("/r", "k", () => {
				throw new Error("exit 1");
			})
		).toBeUndefined();
	});

	it("runs the real git by default, and never throws", () => {
		const dir = mkdtempSync(join(tmpdir(), "gitcfg-"));
		expect(() => readGitConfig(dir, "holocron.test.unset-key")).not.toThrow();
		expect(readGitConfig(dir, "holocron.test.unset-key")).toBeUndefined();
	});
});
