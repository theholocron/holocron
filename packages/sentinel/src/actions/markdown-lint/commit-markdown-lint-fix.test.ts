import { beforeEach, describe, expect, it, vi } from "vitest";

import { SENTINEL_SIGNOFF_TRAILER } from "../../utils/commit-files.js";
import type { LintMarkdownResult } from "./lint-markdown.js";

vi.mock("../../utils/commit-files.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../utils/commit-files.js")>();
	return { ...actual, commitFiles: vi.fn() };
});

import { commitFiles } from "../../utils/commit-files.js";
import { commitMarkdownLintFix } from "./commit-markdown-lint-fix.js";

const FAKE_CLIENT = { git: {} };

beforeEach(() => {
	vi.mocked(commitFiles).mockReset();
});

describe("commitMarkdownLintFix", () => {
	it("maps each fix's file/fixed content to commitFiles()'s { path, content } shape", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: true, commitSha: "new-commit", fileCount: 2 });
		const result: LintMarkdownResult = {
			valid: false,
			fileCount: 2,
			messages: [
				{
					file: "a.md",
					line: 3,
					ruleNames: ["MD004"],
					reason: "Unordered list style",
					errorRange: null,
					severity: "error",
				},
				{
					file: "b.md",
					line: 5,
					ruleNames: ["MD004"],
					reason: "Unordered list style",
					errorRange: null,
					severity: "error",
				},
			],
			fixes: [
				{ file: "a.md", fixed: "# A\n\n* item\n* item\n" },
				{ file: "b.md", fixed: "# B\n\n* item\n* item\n" },
			],
		};

		const outcome = await commitMarkdownLintFix({
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
					{ path: "a.md", content: "# A\n\n* item\n* item\n" },
					{ path: "b.md", content: "# B\n\n* item\n* item\n" },
				],
			})
		);
		expect(outcome).toEqual({ committed: true, commitSha: "new-commit", fileCount: 2 });
	});

	it("passes a message with this org's DCO signoff trailer", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: false, fileCount: 0 });
		const result: LintMarkdownResult = { valid: true, fileCount: 0, messages: [], fixes: [] };

		await commitMarkdownLintFix({
			client: FAKE_CLIENT as never,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		const call = vi.mocked(commitFiles).mock.calls[0]?.[0];
		expect(call?.message).toContain(SENTINEL_SIGNOFF_TRAILER);
	});

	it("omits a flagged file from the commit when its rule has no deterministic fix (empty fixes)", async () => {
		vi.mocked(commitFiles).mockResolvedValue({ committed: false, fileCount: 0 });
		const result: LintMarkdownResult = {
			valid: false,
			fileCount: 1,
			messages: [
				{
					file: "README.md",
					line: 3,
					ruleNames: ["MD001"],
					reason: "Heading levels should only increment by one level at a time",
					errorRange: null,
					severity: "error",
				},
			],
			fixes: [],
		};

		const outcome = await commitMarkdownLintFix({
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
