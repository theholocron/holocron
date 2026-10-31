import type { ResolvedHolocronConfig } from "../config/index.js";

/** A loaded and resolved `holocron.config`. */
export interface LoadedConfig {
	/** The config after `resolveConfig`. */
	resolved: ResolvedHolocronConfig;
	/** Absolute path to the file the config was read from. */
	filepath: string;
}
