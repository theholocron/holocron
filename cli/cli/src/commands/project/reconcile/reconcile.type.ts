import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../load-templates/index.js";
import type { ReconcileChange, ReconcileUnresolved } from "../plan-reconcile/index.js";

/** What {@link runProjectReconcile} needs. */
export interface RunProjectReconcileInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Only this declared board (by name); every declared board when left out. */
	board?: string;
	loader?: PluginLoader;
	/** Reads the repo's own template files; the file system when left out. */
	templatesIo?: TemplatesIo;
	print?: (line: string) => void;
	logger?: Logger;
}

/** What happened to one board. */
export interface BoardReconcileOutcome {
	/** The board's declared name. */
	name: string;
	/** The changes the rules called for. */
	changes: ReconcileChange[];
	/** Keys of the changes that were made (empty on a dry run). */
	applied: string[];
	/** Open items with no status, left as they are. */
	unset: string[];
	/** Items a rule applies to whose template has no status of the category. */
	unresolved: ReconcileUnresolved[];
}

/** What {@link runProjectReconcile} did. */
export interface ProjectReconcileReport {
	/** `fail` when a board could not be read or a status could not be set. */
	status: "ok" | "fail" | "dry-run";
	boards: BoardReconcileOutcome[];
	/** Steps that failed; the run carried on past each. */
	failures: Array<{ step: string; message: string }>;
	/** Why the run did nothing, when it did nothing. */
	message?: string;
}
