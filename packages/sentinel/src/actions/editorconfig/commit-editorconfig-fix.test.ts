import { beforeEach, describe, expect, it, vi } from "vitest";

import { SENTINEL_SIGNOFF_TRAILER } from "../../utils/commit-files.js";
import type { LintEditorConfigResult } from "./lint-editorconfig.js";

vi.mock("../../utils/commit-files.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../utils/commit-files.js")>();
	return { ...actual, commitFiles: vi.fn() };
});

import { commitFiles } from "../../utils/commit-files.js";
import { commitEditorConfigFix } from "./commit-editorconfig-fix.js";

const FAKE_CLIENT = { git: {} };

beforeEach(() => {
	vi.mocked(commitFiles).mockReset();
});

describe("commitEditorConfigFix", () => {
	it("maps each fix's file/fixed content to commitFiles()'s { path, content } shape", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 2 });
		const result: LintEditorConfigResult = {
			valid: false,
			fileCount: 2,
			messages: [
				{ file: "a.ts", line: 1, reason: "Trailing whitespace." },
				{ file: "b.ts", line: 1, reason: "Missing final newline." },
			],
			fixes: [
				{ file: "a.ts", fixed: "const a = 1;\n" },
				{ file: "b.ts", fixed: "const b = 2;\n" },
			],
		};

		const outcome = await commitEditorConfigFix({
			client: FAKE_CLIENT as never,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		expect(commitFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				client: FAKE_CLIENT,
				repo: "acme/demo",
				headSha: "sha1",
				headRef: "feature",
				files: [
					{ path: "a.ts", content: "const a = 1;\n" },
					{ path: "b.ts", content: "const b = 2;\n" },
				],
			})
		);
		expect(outcome).toEqual({ committed: true, commitSha: "new-commit", fileCount: 2 });
	});

	it("passes a message with this org's DCO signoff trailer", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: false, fileCount: 0 });
		const result: LintEditorConfigResult = { valid: true, fileCount: 0, messages: [], fixes: [] };

		await commitEditorConfigFix({
			client: FAKE_CLIENT as never,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		const call = vi.mocked(commitFiles).mock.calls[0]?.[0];
		expect(call?.message).toContain(SENTINEL_SIGNOFF_TRAILER);
	});

	it("omits a flagged file from the commit when indent_style couldn't be safely fixed (empty fixes)", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: false, fileCount: 0 });
		const result: LintEditorConfigResult = {
			valid: false,
			fileCount: 1,
			messages: [{ file: "weird.ts", line: 1, reason: "Expected tab indentation." }],
			fixes: [],
		};

		const outcome = await commitEditorConfigFix({
			client: FAKE_CLIENT as never,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		expect(commitFiles).toHaveBeenCalledWith(expect.objectContaining({ files: [] }));
		expect(outcome).toEqual({ committed: false, fileCount: 0 });
	});
});
