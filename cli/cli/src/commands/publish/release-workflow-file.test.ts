import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { releaseWorkflowFile } from "./release-workflow-file.js";

const dirs: string[] = [];

/** A repo with the given files in `.github/workflows`. */
function repoWith(...files: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "holocron-release-workflow-"));
	dirs.push(dir);
	mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
	for (const file of files) writeFileSync(join(dir, ".github", "workflows", file), "name: x\n");
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("releaseWorkflowFile", () => {
	it("is the release caller the repo has", () => {
		expect(releaseWorkflowFile(repoWith("ci.release.yml", "release.yml"))).toBe("ci.release.yml");
	});

	it("is the older caller in a repo that still has that one", () => {
		expect(releaseWorkflowFile(repoWith("delivery.publish.yml"))).toBe("delivery.publish.yml");
	});

	it("prefers the current name when both exist", () => {
		expect(releaseWorkflowFile(repoWith("delivery.publish.yml", "ci.release.yml"))).toBe("ci.release.yml");
	});

	it("is the current name when the repo has no release caller, or no workflows at all", () => {
		expect(releaseWorkflowFile(repoWith("ci.build.yml"))).toBe("ci.release.yml");
		expect(releaseWorkflowFile(mkdtempSync(join(tmpdir(), "holocron-no-workflows-")))).toBe("ci.release.yml");
	});
});
