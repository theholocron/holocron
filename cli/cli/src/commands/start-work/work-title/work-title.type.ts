import type { IssueKind } from "../../../plugin/index.js";

/** What {@link workTitle} reads. */
export interface WorkTitleInput {
	/** The issue's title; a conventional-commit prefix and emoji are taken off it. */
	issueTitle: string;
	/** The issue's kind, from `--type`; wins over everything else. */
	kind?: IssueKind;
	/** The issue's labels. */
	labels?: string[];
	/** The pull request carries only the spec: `docs(specs): ...`. */
	specOnly?: boolean;
}

/** The title chosen, its parts and what decided the type. */
export interface WorkTitle {
	/** The whole Conventional Commit line. */
	title: string;
	/** The commit type, which is also the branch's. */
	type: string;
	/** The scope, when one is known. */
	scope?: string;
	/** What is left of the issue's title. */
	subject: string;
	/** Why the type is what it is (`chore` is the fallback and says so). */
	reason: string;
}
