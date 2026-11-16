import type { DocsCoverageMode } from "@theholocron/astromech";

import type { PluginLoader } from "../../plugin/index.js";

/** What {@link coverageConfigFiles} reads. */
export interface CoverageConfigFilesInput {
	/** A loaded loader (`load()` already ran); only its `coverage` provider is used. */
	loader: Pick<PluginLoader, "get" | "has">;
	/** The workspace root: its packages are the components, and an existing config file is read from it. */
	repoRoot: string;
	/** `repoValidation.docsCoverage`; `off` when the config leaves it out. */
	docsCoverage?: DocsCoverageMode;
}
