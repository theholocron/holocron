import type { LoadedConfig } from "../../../config/index.js";
import type { Issues, PluginLoader, Projects, RuntimeContext } from "../../../plugin/index.js";
import type { Endpoint } from "../parse-endpoint/index.js";

/** What {@link openSide} needs. */
export interface OpenSideInput {
	/** The repo's config; its own entry for the same provider supplies the options the endpoint does not. */
	loaded: LoadedConfig;
	/** The runtime context, which carries the tokens. */
	context: RuntimeContext;
	/** Which provider, and the options that point it somewhere. */
	endpoint: Endpoint;
	/** Which capabilities to load from it. */
	capabilities: Array<"issues" | "projects">;
	/** Builds the loader. Defaults to a real one over the derived config. */
	makeLoader?: (resolved: LoadedConfig["resolved"], context: RuntimeContext) => PluginLoader;
}

/** One side of a migration, loaded. */
export type Side = { ok: true; provider: string; issues?: Issues; projects?: Projects } | { ok: false; reason: string };
