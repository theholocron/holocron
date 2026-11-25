import type { ResolvedHolocronConfig } from "../../config/index.js";

/** A workspace app: a package under `apps/`, with its own `holocron.config` when it has one. */
export interface WorkspaceApp {
	/** The app folder's name (`sentinel`): what a command takes, and the project or Worker name. */
	name: string;
	/** The folder, relative to the repo root (`apps/sentinel`). */
	path: string;
	/** The absolute folder. */
	dir: string;
	/** The app's resolved config; absent for an app with no `holocron.config` of its own. */
	config?: ResolvedHolocronConfig;
	/** Why the app's `holocron.config` could not be read. */
	configError?: string;
}

/** What {@link resolveApp} found. */
export interface AppLookup {
	/** The workspace root the lookup read. */
	repoRoot: string;
	/** The app, when one matched. */
	app?: WorkspaceApp;
	/** Every app's name, for a message. */
	names: string[];
}
