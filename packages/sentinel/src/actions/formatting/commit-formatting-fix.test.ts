import { beforeEach, describe, expect, it, vi } from "vitest";

import { SENTINEL_SIGNOFF_TRAILER } from "../../utils/commit-files.js";
import type { LintFormattingResult } from "./lint-formatting.js";

vi.mock("../../utils/commit-files.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../utils/commit-files.js")>();
	return { ...actual, commitFiles: vi.fn() };
});

import { commitFiles } from "../../utils/commit-files.js";
import { commitFormattingFix } from "./commit-formatting-fix.js";

const FAKE_CLIENT = { git: {} };

beforeEach(() => {
	vi.mocked(commitFiles).mockReset();
});

describe("commitFormattingFix", () => {
	it("maps each message's file/formatted content to commitFiles()'s { path, content } shape", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 2 });
		const result: LintFormattingResult = {
			valid: false,
			fileCount: 2,
			messages: [
				{ file: "a.js", line: 1, reason: "...", formatted: "const a = 1;\n" },
				{ file: "b.js", line: 1, reason: "...", formatted: "const b = 2;\n" },
			],
		};

		const outcome = await commitFormattingFix({
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
					{ path: "a.js", content: "const a = 1;\n" },
					{ path: "b.js", content: "const b = 2;\n" },
				],
			})
		);
		expect(outcome).toEqual({ committed: true, commitSha: "new-commit", fileCount: 2 });
	});

	it("passes a message with this org's DCO signoff trailer", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: false, fileCount: 0 });
		const result: LintFormattingResult = { valid: true, fileCount: 0, messages: [] };

		await commitFormattingFix({
			client: FAKE_CLIENT as never,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		const call = vi.mocked(commitFiles).mock.calls[0]?.[0];
		expect(call?.message).toContain(SENTINEL_SIGNOFF_TRAILER);
	});
});
