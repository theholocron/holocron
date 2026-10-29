/** One exported symbol (or a member of one) that should carry a doc comment. */
export interface DocSymbol {
	/** `Function`, `Interface`, `Method`, … */
	kind: string;
	name: string;
	/** The file it is declared in, relative to the repo root. */
	file: string;
	/** 1-indexed line of the declaration. */
	line: number;
	documented: boolean;
}

export interface PackageDocs {
	/** The package's npm name. */
	name: string;
	/** The package directory, relative to the repo root (`utils/array-utils`). */
	dir: string;
	symbols: DocSymbol[];
}

/** The subset of TypeDoc's `--json` output the count reads. */
export interface TypedocReflection {
	name: string;
	kind: number;
	flags?: { isPrivate?: boolean; isExternal?: boolean };
	inheritedFrom?: unknown;
	comment?: TypedocComment;
	sources?: { fileName: string; line: number }[];
	signatures?: { comment?: TypedocComment; sources?: { fileName: string; line: number }[] }[];
	getSignature?: { comment?: TypedocComment };
	setSignature?: { comment?: TypedocComment };
	children?: TypedocReflection[];
	type?: { declaration?: { children?: TypedocReflection[] } };
}

export interface TypedocComment {
	summary?: unknown[];
	blockTags?: unknown[];
}

export interface MeasureDocsCoverageInput {
	repoRoot: string;
	/** Runs TypeDoc for one entry point and returns its `--json` model. */
	typedoc: (entry: string, tsconfig: string | undefined) => { children?: TypedocReflection[] };
	/** The public packages and where their entry point is; replaces the workspace scan. */
	packages?: { name: string; dir: string; entry: string; tsconfig?: string }[];
}
