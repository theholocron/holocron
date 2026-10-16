import type { ResolvedHolocronConfig } from "../config/config.type.js";

export interface LoadedConfig {
	resolved: ResolvedHolocronConfig;
	/** Absolute path to the file the config was read from. */
	filepath: string;
}
