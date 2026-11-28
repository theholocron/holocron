import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ignoreAdvice } from "../ignore-advice/index.js";
import { PRIVATE_CREDENTIALS_FILE, PRIVATE_DIR } from "../private-dir.js";
import { resolveCredentialsFile } from "./resolve-credentials-file.js";

describe("resolveCredentialsFile", () => {
	it("defaults to .holocron/.private/.credentials under the base, creating the directory", () => {
		const makeDir = vi.fn();
		const target = resolveCredentialsFile("/repo", undefined, makeDir);
		expect(target).toEqual({ path: resolve("/repo", PRIVATE_CREDENTIALS_FILE), isDefault: true });
		expect(makeDir).toHaveBeenCalledWith(resolve("/repo", PRIVATE_DIR));
	});

	it("treats an empty --file as no --file", () => {
		expect(resolveCredentialsFile("/repo", "", vi.fn()).isDefault).toBe(true);
	});

	it("lets --file win, relative to the base, and creates nothing", () => {
		const makeDir = vi.fn();
		expect(resolveCredentialsFile("/repo", "out/x.env", makeDir)).toEqual({
			path: resolve("/repo", "out/x.env"),
			isDefault: false,
		});
		expect(makeDir).not.toHaveBeenCalled();
	});

	it("makes the real directory owner-only when missing, and is fine when it exists", () => {
		const base = mkdtempSync(join(tmpdir(), "private-dir-"));
		try {
			resolveCredentialsFile(base, undefined);
			resolveCredentialsFile(base, undefined);
			expect(statSync(join(base, PRIVATE_DIR)).mode & 0o777).toBe(0o700);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

describe("ignoreAdvice", () => {
	it("tells a repo missing the rule to run sync", () => {
		expect(ignoreAdvice(true, "choose another path with --file")).toMatch(/holocron sync/);
	});

	it("keeps the old advice for a path given with --file", () => {
		expect(ignoreAdvice(false, "choose another path with --file")).toBe(
			"add it to .gitignore, or choose another path with --file"
		);
	});
});
