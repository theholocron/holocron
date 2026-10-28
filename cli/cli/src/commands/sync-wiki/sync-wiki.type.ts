import type { LoadedConfig } from "../../config/index.js";
import type { RuntimeContext } from "../../plugin/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WikiRepo {
	displayName: string;
	basepath: string;
	/** Full custom domain with basepath, e.g. "wiki.theholocron.dev/skills". */
	domain?: string;
}

export interface RunSyncWikiInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	token?: string;
	fetch?: typeof globalThis.fetch;
}

export interface OrgRepo {
	name: string;
	full_name: string;
	archived: boolean;
}

export interface FileContents {
	content: string;
	encoding: string;
}
