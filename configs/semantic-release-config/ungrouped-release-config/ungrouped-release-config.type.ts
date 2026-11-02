import type { DefineConfigOptions } from "../group-release-config/index.js";

export interface UngroupedReleaseOptions extends DefineConfigOptions {
	/** The version groups released on their own: folders of the repo whose commits this release ignores. */
	groups: readonly string[];
}
