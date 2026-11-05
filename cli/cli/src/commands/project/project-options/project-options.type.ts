/** One board a repo keeps: which template it follows and what it is called. */
export interface BoardDeclaration {
	/** The template's name, a built-in or a file in the templates directory. */
	template: string;
	/** The board's name, which is how it is found among the open boards. */
	name: string;
}

/** The options of `providers.projects`, with their defaults filled in. */
export interface ProjectOptions {
	/** Whoever the boards belong to (a GitHub organization): the `org` option, else the config's `org`. */
	owner: string;
	/** The boards this repo keeps, template to name. Empty when the option is absent. */
	boards: BoardDeclaration[];
	/** The directory holding the repo's own template files, relative to the repo root. */
	templatesDir: string;
}

/** What {@link resolveProjectOptions} made: the options, or every problem with them. */
export type ResolveProjectOptionsResult = { ok: true; options: ProjectOptions } | { ok: false; problems: string[] };
