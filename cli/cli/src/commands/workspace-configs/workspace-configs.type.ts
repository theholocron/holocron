import type { ResolvedHolocronConfig } from "../../config/index.js";

/** A workspace package that has a `holocron.config.*` of its own: its config, or why it could not be read. */
export type WorkspaceConfig =
	| {
			/** The package's folder, relative to the repo root (`apps/sentinel`). */
			path: string;
			/** The package's absolute folder. */
			dir: string;
			resolved: ResolvedHolocronConfig;
	  }
	| {
			path: string;
			dir: string;
			/** Why the config could not be loaded. */
			error: string;
	  };
