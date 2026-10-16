import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/load-config/load-config.type.js";
import { PluginLoader } from "../../plugin/loader/loader.js";
import type { RuntimeContext } from "../../plugin/loader/loader.type.js";
import type { SetupPrintLine } from "../setup/index.js";
import type { SYNC_STEPS } from "./sync.js";

export type SyncStep = (typeof SYNC_STEPS)[number];

export interface RunSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	steps?: string[];
	loader?: PluginLoader;
	print?: SetupPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}
