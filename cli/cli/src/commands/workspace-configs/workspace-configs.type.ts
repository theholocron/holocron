import type { ResolvedHolocronConfig } from "../../config/index.js";

/** A workspace package that has a `holocron.config.*` of its own, whichever way reading it went. */
interface WorkspaceConfigBase {
	/** The package's folder, relative to the repo root (`apps/sentinel`). */
	path: string;
	/** The package's absolute folder. */
	dir: string;
}

/** A package whose config loaded. */
export interface LoadedWorkspaceConfig extends WorkspaceConfigBase {
	resolved: ResolvedHolocronConfig;
}

/** A package whose config could not be loaded. */
export interface FailedWorkspaceConfig extends WorkspaceConfigBase {
	/** Why the config could not be loaded. */
	error: string;
}

/** A workspace package's config, or why it could not be read. */
export type WorkspaceConfig = LoadedWorkspaceConfig | FailedWorkspaceConfig;
