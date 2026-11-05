import type { LoadedConfig } from "../../../config/index.js";
import type { BoardTemplate, PluginLoader, Projects, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../load-templates/index.js";
import type { BoardDeclaration } from "../project-options/index.js";

/** What a command that works on declared boards needs, read from the config and the template files. */
export interface BoardContext {
	/** The `projects` provider. */
	projects: Projects;
	/** Whoever the boards belong to. */
	owner: string;
	/** The boards `providers.projects.boards` declares. */
	boards: BoardDeclaration[];
	/** Every template by name: the built-ins and the repo's own. */
	templates: Record<string, BoardTemplate>;
	/** What was wrong with a template file, one line each, naming the file. */
	templateProblems: string[];
}

/** {@link BoardContext}, or the reason there is none. */
export type BoardContextResult =
	{ ok: true; context: BoardContext } | { ok: false; kind: "skip" | "fail"; reason: string; problems: string[] };

export interface OpenBoardContextInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** A loader whose `load()` has run. */
	loader: PluginLoader;
	/** Where the template files are read from. Defaults to the real file system. */
	io?: TemplatesIo;
}
