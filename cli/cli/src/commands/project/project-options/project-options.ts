import type { BoardDeclaration, ResolveProjectOptionsResult } from "./project-options.type.js";

/** Where a repo's own template files live unless the `templates` option says otherwise. */
export const DEFAULT_TEMPLATES_DIR = ".holocron/projects";

/**
 * Read the options of `providers.projects`: `org` (the owner, defaulting to `fallbackOwner`, the config's org), `boards`
 * (a list of `{ template, name }`, nothing else about a board is written in the config) and `templates` (the directory
 * of template files). Every problem is listed at once, and two boards with the same name are one.
 */
export function resolveProjectOptions(
	options: Readonly<Record<string, unknown>>,
	fallbackOwner: string
): ResolveProjectOptionsResult {
	const problems: string[] = [];

	const org = options.org;
	if (org !== undefined && (typeof org !== "string" || org.trim() === "")) problems.push("org must be text");
	const owner = typeof org === "string" && org.trim() !== "" ? org : fallbackOwner;

	const dir = options.templates;
	if (dir !== undefined && (typeof dir !== "string" || dir.trim() === "")) {
		problems.push("templates must be the path of a directory");
	}

	const boards: BoardDeclaration[] = [];
	if (options.boards !== undefined) {
		if (!Array.isArray(options.boards)) {
			problems.push("boards must be a list of { template, name }");
		} else {
			const seen = new Set<string>();
			options.boards.forEach((entry: unknown, i) => {
				const where = `boards[${i}]`;
				if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
					problems.push(`${where} must be { template, name }`);
					return;
				}
				const { template, name } = entry as Record<string, unknown>;
				if (typeof template !== "string" || template.trim() === "") problems.push(`${where} needs a template`);
				if (typeof name !== "string" || name.trim() === "") problems.push(`${where} needs a name`);
				if (typeof template !== "string" || typeof name !== "string" || !template.trim() || !name.trim())
					return;
				if (seen.has(name)) problems.push(`${where}: the board name "${name}" is used twice`);
				seen.add(name);
				boards.push({ template, name });
			});
		}
	}

	if (problems.length > 0) return { ok: false, problems };
	return {
		ok: true,
		options: { owner, boards, templatesDir: typeof dir === "string" ? dir : DEFAULT_TEMPLATES_DIR },
	};
}
