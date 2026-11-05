import type { HolocronConfig } from "../config/index.js";
import { system } from "../system/index.js";

/** Returns the config unchanged; it exists to type and autocomplete a `holocron.config.ts`. */
export function defineConfig(config: HolocronConfig): HolocronConfig {
	return system.defineConfig(config);
}
