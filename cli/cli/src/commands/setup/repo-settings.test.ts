import { describe, expect, it } from "vitest";

import { BALANCED_REPO_SETTINGS } from "./repo-settings.js";

describe("BALANCED_REPO_SETTINGS", () => {
	it("allows squash merge only", () => {
		expect(BALANCED_REPO_SETTINGS.allow_squash_merge).toBe(true);
		expect(BALANCED_REPO_SETTINGS.allow_merge_commit).toBe(false);
		expect(BALANCED_REPO_SETTINGS.allow_rebase_merge).toBe(false);
	});

	it("enables auto-merge and branch hygiene", () => {
		expect(BALANCED_REPO_SETTINGS.allow_auto_merge).toBe(true);
		expect(BALANCED_REPO_SETTINGS.allow_update_branch).toBe(true);
		expect(BALANCED_REPO_SETTINGS.delete_branch_on_merge).toBe(true);
	});

	it("enables issues and discussions but not wiki", () => {
		expect(BALANCED_REPO_SETTINGS.has_issues).toBe(true);
		expect(BALANCED_REPO_SETTINGS.has_discussions).toBe(true);
		expect(BALANCED_REPO_SETTINGS.has_wiki).toBe(false);
	});

	it("does not set web_commit_signoff_required (org-level enforces it)", () => {
		expect(BALANCED_REPO_SETTINGS).not.toHaveProperty("web_commit_signoff_required");
	});
});
