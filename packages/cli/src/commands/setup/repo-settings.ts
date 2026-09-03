import type { RepoSettings } from "../../plugin/capabilities.js";

export const BALANCED_REPO_SETTINGS: RepoSettings = {
	allow_squash_merge: true,
	allow_merge_commit: false,
	allow_rebase_merge: false,
	allow_auto_merge: true,
	allow_update_branch: true,
	delete_branch_on_merge: true,
	has_issues: true,
	has_discussions: true,
	has_projects: true,
	has_wiki: false,
	// web_commit_signoff_required is intentionally omitted: GitHub rejects this
	// field when the organization already enforces it at org level (422). Org-level
	// enforcement already covers every repo — no per-repo override is needed.
};
