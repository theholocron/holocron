import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lintCommitMsgFile } from "./lint-commit-msg-file.js";

// A real repo checkout, isolated per test: symlinked node_modules (so
// @theholocron/commitlint-config resolves) + a real commitlint.config.ts,
// same shape every real repo in this org actually has. Proves
// lintCommitMsgFile discovers it the same way `commitlint --edit` (no
// --config flag) already does today -- the whole point of this function.
let tmpDir: string;
beforeEach(async () => {
	const tmpRoot = tmpdir();
	await mkdir(tmpRoot, { recursive: true });
	tmpDir = await mkdtemp(join(tmpRoot, "cli-commit-msg-file-"));
	const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
	await symlink(join(packageRoot, "node_modules"), join(tmpDir, "node_modules"), "dir");
	await writeFile(
		join(tmpDir, "commitlint.config.ts"),
		'export default { extends: ["@theholocron/commitlint-config"] };\n',
		"utf8"
	);
});
afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("lintCommitMsgFile — a valid message", () => {
	it("discovers the repo's own commitlint.config.ts and reports no violations", async () => {
		const msgFile = join(tmpDir, "COMMIT_EDITMSG");
		await writeFile(msgFile, "feat: 💥 add thing\n", "utf8");

		const result = await lintCommitMsgFile(msgFile, tmpDir);

		expect(result).toEqual({ valid: true, violations: [] });
	});
});

describe("lintCommitMsgFile — an invalid message", () => {
	it("returns the real rule name and commitlint's own message for each violation", async () => {
		const msgFile = join(tmpDir, "COMMIT_EDITMSG");
		await writeFile(msgFile, "not a conventional commit\n", "utf8");

		const result = await lintCommitMsgFile(msgFile, tmpDir);

		expect(result.valid).toBe(false);
		expect(result.violations).toEqual([
			{ rule: "subject-empty", message: "subject may not be empty" },
			{ rule: "type-empty", message: "type may not be empty" },
		]);
	});
});
