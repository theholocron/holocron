/**
 * Factory that binds `source` and `tool` once and returns all header
 * constructors. Prefer this over calling workflowHeader() with explicit
 * arguments at every call site.
 *
 * @example
 * const { workflowHeader, scaffoldHeader } = createHeader({
 *   source: "packages/cli/src/templates/configs/editorconfig/create-config.ts",
 * });
 *
 * export function createConfig(): string {
 *   return `${workflowHeader()}${body}`;
 * }
 */

/** Comment style produced by workflowHeader. */
export type WorkflowHeaderFormat = "yaml" | "cjs" | "shebang";

export interface CreateHeaderOptions {
	/** Path within theholocron/holocron that owns the file being generated. */
	source: string;
	/** CLI command that produces the file. Defaults to "holocron setup". */
	tool?: string;
	/** Set true only when writing to theholocron/.github itself. */
	forPrimary?: boolean;
}

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

export function createHeader(options: CreateHeaderOptions): HeaderFunctions {
	const { source, tool = "holocron setup", forPrimary = false } = options;

	const doNotEdit = forPrimary
		? `AUTO-GENERATED — do not edit in theholocron/.github directly.`
		: `AUTO-GENERATED — do not edit directly.`;

	return {
		workflowHeader(format: WorkflowHeaderFormat = "yaml"): string {
			if (format === "cjs") {
				return [
					`/* ${doNotEdit}`,
					` * Source:  theholocron/holocron · ${source}`,
					` * Tool:    ${tool}`,
					` * Changes: edit source in theholocron/holocron`,
					` */`,
					``,
				].join("\n");
			}

			const yamlLines = [
				`# ${doNotEdit}`,
				`# Source:  theholocron/holocron · ${source}`,
				`# Tool:    ${tool}`,
				`# Changes: edit source in theholocron/holocron`,
				``,
			].join("\n");

			if (format === "shebang") {
				return `#!/bin/sh\n\n${yamlLines}`;
			}

			return yamlLines;
		},

		scaffoldHeader(): string {
			return [
				`# Scaffolded by holocron setup — edit this file freely.`,
				`# Source:  theholocron/holocron · ${source}`,
				``,
			].join("\n");
		},
	};
}
