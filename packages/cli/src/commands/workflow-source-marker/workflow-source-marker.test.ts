import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolvePkgRelPath, sanitizeForDisplay, SOURCE_PACKAGE_MARKER } from "./workflow-source-marker.js";

describe("sanitizeForDisplay", () => {
	it("strips the ESC byte, neutralizing an ANSI escape sequence", () => {
		// The ESC byte (\x1b) is what makes "[31m" an executable escape
		// sequence to a terminal rather than four literal characters --
		// removing just that byte is enough to neutralize it; the remaining
		// bracket/digit/letter text is inert, ordinary (if ugly) output.
		expect(sanitizeForDisplay("apps/sentinel\x1b[31mred\x1b[0m")).toBe("apps/sentinel[31mred[0m");
	});

	it("strips other control characters (e.g. a literal backspace)", () => {
		expect(sanitizeForDisplay("apps/sentinel\x08\x7f")).toBe("apps/sentinel");
	});

	it("leaves ordinary text untouched", () => {
		expect(sanitizeForDisplay("apps/sentinel")).toBe("apps/sentinel");
	});
});

describe("SOURCE_PACKAGE_MARKER", () => {
	it("captures the path from a marker line", () => {
		expect(SOURCE_PACKAGE_MARKER.exec("# Source package: apps/sentinel\n\nname: Test")?.[1]).toBe("apps/sentinel");
	});

	it("doesn't match when no marker line is present", () => {
		expect(SOURCE_PACKAGE_MARKER.exec("name: Test")).toBeNull();
	});
});

describe("resolvePkgRelPath", () => {
	let gitRoot: string;

	beforeEach(async () => {
		gitRoot = await mkdtemp(join(tmpdir(), "workflow-source-marker-"));
	});
	afterEach(async () => {
		await rm(gitRoot, { recursive: true, force: true });
	});

	it("returns '.' for a config at the git root", () => {
		expect(resolvePkgRelPath(gitRoot, join(gitRoot, "holocron.config.ts"))).toBe(".");
	});

	it("returns the package's repo-relative directory for a subpackage config", async () => {
		const pkgDir = join(gitRoot, "apps", "sentinel");
		await mkdir(pkgDir, { recursive: true });
		expect(resolvePkgRelPath(gitRoot, join(pkgDir, "holocron.config.ts"))).toBe("apps/sentinel");
	});

	it("resolves symlinks before computing the relative path", async () => {
		const realPkgDir = join(gitRoot, "apps", "sentinel");
		await mkdir(realPkgDir, { recursive: true });
		const linkDir = join(gitRoot, "link-to-sentinel");
		await symlink(realPkgDir, linkDir);
		expect(resolvePkgRelPath(gitRoot, join(linkDir, "holocron.config.ts"))).toBe("apps/sentinel");
	});

	it("throws when the resolved path would contain a line break", () => {
		const weirdDir = join(gitRoot, "apps\nsentinel");
		expect(() => resolvePkgRelPath(gitRoot, join(weirdDir, "holocron.config.ts"))).toThrow(/line break/);
	});
});
