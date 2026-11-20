import type { LoadedConfig } from "../../../config/index.js";
import type { IssuePriority, PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../../project/load-templates/index.js";

/** What {@link addIssueToBoard} needs. */
export interface AddIssueToBoardInput {
	/** The repo's config: its `providers.projects` boards. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** A loader whose `load()` has run and that holds the `projects` provider. */
	loader: PluginLoader;
	/** The declared board's name, matched without regard to case. */
	board: string;
	/** The issue's key in the tracker (`#12`). */
	key: string;
	/** The issue's priority, set on the board where it has an option for it. */
	priority?: IssuePriority;
	/** Where the template files are read from. Defaults to the real file system. */
	io?: TemplatesIo;
	/** Read the board, change nothing. */
	dryRun?: boolean;
}
