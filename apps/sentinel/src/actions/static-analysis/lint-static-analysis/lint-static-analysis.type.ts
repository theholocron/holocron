import type { GitHubClient } from "@theholocron/github-client";

export interface LintStaticAnalysisInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
	/** Repo-root-relative directories — `holocron.config.ts`'s `eslint.browserPackages`, passed through unchanged to `library()`. */
	browserPackages?: string[];
}

export interface StaticAnalysisMessage {
	file: string;
	/** 1-indexed — eslint's own `Linter.LintMessage.line`, populated even for a parse error. */
	line: number;
	column: number;
	/** `null` for a parse error — eslint's own `Linter.LintMessage.ruleId` shape, not a rule violation. */
	ruleId: string | null;
	reason: string;
	severity: "error" | "warning";
}

export interface LintStaticAnalysisResult {
	valid: boolean;
	fileCount: number;
	messages: StaticAnalysisMessage[];
}
