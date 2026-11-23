import type { IssueTypeDeclaration, IssueTypeInfo } from "../../../plugin/index.js";

/** One field of an existing Type that differs from the declaration. */
export interface TypeChange {
	/** Which field differs. */
	field: "description" | "color";
	/** The value the organization has now. */
	was: string;
	/** The value the declaration states. */
	to: string;
}

/** What to do about one declared Type. */
export type TypeAction =
	| { kind: "create"; declared: IssueTypeDeclaration }
	| { kind: "update"; declared: IssueTypeDeclaration; existing: IssueTypeInfo; changes: TypeChange[] }
	| { kind: "exists"; declared: IssueTypeDeclaration; existing: IssueTypeInfo };

/** The plan: one action per declared Type, in declaration order. */
export interface IssueTypesPlan {
	/** One action per declared Type. */
	actions: TypeAction[];
	/** The Types the organization has now plus those the plan would make. */
	total: number;
}
