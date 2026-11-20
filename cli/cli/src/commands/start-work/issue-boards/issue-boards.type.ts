import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../../project/load-templates/index.js";

/** What {@link readIssueBoards} needs. */
export interface ReadIssueBoardsInput {
	/** The repo's config; its `providers.projects` entry names the declared boards. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** A loader whose `load()` has run. */
	loader: PluginLoader;
	/** The issue's addresses, every spelling known (`2500`, `#2500`, `owner/repo#2500`); a board item matching any counts. */
	keys: string[];
	/** Where the template files are read from. Defaults to the real file system. */
	templatesIo?: TemplatesIo;
}

/** The declared boards the issue is on, or why they could not be read. */
export interface IssueBoards {
	/** The titles of the declared boards that hold the issue. */
	boards: string[];
	/** Why the boards were not (all) read; the run goes on without them. */
	problem?: string;
}
