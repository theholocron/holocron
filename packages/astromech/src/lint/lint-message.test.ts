import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import load from "@commitlint/load";
import type { QualifiedConfig } from "@commitlint/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lintCommitMessage } from "./lint-message.js";

// Isolated from any ambient config, same reasoning as lint-commits.ts's own
// loadIsolatedConfig(): a plain `load({ extends: [...] })` with no `file`
// override still does its own cosmiconfig upward search from cwd and merges
// whatever it finds in underneath the seed -- found live once already
// (holocron#769/#771) giving a false-positive pass by silently picking up
// this very monorepo's own root commitlint.config.ts. An explicit `file`
// pointing at an empty seed makes this test's result depend on nothing but
// @theholocron/commitlint-config itself.
let loaded: QualifiedConfig;
let tmpDir: string;
beforeAll(async () => {
	const tmpRoot = tmpdir();
	await mkdir(tmpRoot, { recursive: true });
	tmpDir = await mkdtemp(join(tmpRoot, "cli-commit-lint-"));
	const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
	await symlink(join(packageRoot, "node_modules"), join(tmpDir, "node_modules"), "dir");
	const seedFile = join(tmpDir, "seed.json");
	await writeFile(seedFile, "{}", "utf8");
	loaded = await load({ extends: ["@theholocron/commitlint-config"] }, { file: seedFile });
});
afterAll(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("lintCommitMessage — a valid message", () => {
	it("returns no violations", async () => {
		const violations = await lintCommitMessage("feat: 💥 add thing", loaded);
		expect(violations).toEqual([]);
	});
});

describe("lintCommitMessage — an invalid message", () => {
	it("returns the real rule name and commitlint's own message for each violation", async () => {
		const violations = await lintCommitMessage("not a conventional commit", loaded);
		expect(violations).toEqual([
			{ rule: "subject-empty", message: "subject may not be empty" },
			{ rule: "type-empty", message: "type may not be empty" },
		]);
	});
});

describe("lintCommitMessage — the shared config's dependabot ignore rule", () => {
	it("doesn't flag a long dependency-bump message the ignore matcher is meant to cover", async () => {
		// Confirmed against real commitlint behavior: this exact message fails
		// header-max-length + subject-case with the ignore matcher stripped
		// out, and passes with it wired in via loaded.ignores.
		const longBump =
			"chore(deps): Bump the all-dependencies group across 1 directory with 42 updates including some genuinely very long package names that push this well past a hundred characters";
		const violations = await lintCommitMessage(longBump, loaded);
		expect(violations).toEqual([]);
	});
});
