/** Comment style produced by workflowHeader. */
export type WorkflowHeaderFormat = "yaml" | "cjs" | "shebang";

/** Where a generated file came from, for the header `createHeader` writes. */
export interface CreateHeaderOptions {
	/** Path within theholocron/holocron that owns the file being generated. */
	source: string;
	/** CLI command that produces the file. Defaults to "holocron repo setup". */
	tool?: string;
	/** Set true only when writing to theholocron/.github itself. */
	forPrimary?: boolean;
}

/** The header writers `createHeader` returns, one per kind of generated file. */
export interface HeaderFunctions {
	/**
	 * "AUTO-GENERATED — do not edit" header for files managed on every run.
	 *
	 * format:
	 *   "yaml"    — `# …` comment lines (YAML, text, ignore files)
	 *   "cjs"     — `/* … *\/` block comment (CommonJS modules)
	 *   "shebang" — `#!/bin/sh` on line 1, then yaml header (shell scripts)
	 */
	workflowHeader(format?: WorkflowHeaderFormat): string;
	/**
	 * "Scaffolded — edit this file freely" header for one-time generated files
	 * that the user is expected to take over (e.g. codecov.yml).
	 */
	scaffoldHeader(): string;
}
