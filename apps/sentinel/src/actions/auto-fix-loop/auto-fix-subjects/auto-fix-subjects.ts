import type { AutoFixKind } from "./auto-fix-subjects.type.js";

/**
 * The subject line of the commit each auto-fixer makes. The fixers write it and the loop guard
 * ({@link blockedAutoFixKinds}) reads it back, so a commit is recognised as a kind's by this exact line and
 * the two cannot drift apart.
 */
export const AUTO_FIX_SUBJECTS: Record<AutoFixKind, string> = {
	formatting: "style: apply prettier formatting (auto-fix via Sentinel)",
	"markdown-lint": "style: apply markdownlint fixes (auto-fix via Sentinel)",
	editorconfig: "style: apply editorconfig fixes (auto-fix via Sentinel)",
};
