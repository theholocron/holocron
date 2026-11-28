import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { AppEnv } from "../app-env/index.js";
import type { WorkspaceApp } from "../resolve-app/index.js";
import type { runSecretsSync } from "../secrets-sync/index.js";

/** What {@link RunAppSyncInput.load} gives back. */
export interface AppSyncLoad {
	/** The app's config, loaded in its own folder (the providers and `repo.secrets.deploy` come from it). */
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** The plugin loader over the app's config. */
	loader: PluginLoader;
}

/** Input to {@link runAppSync}. */
export interface RunAppSyncInput {
	app: WorkspaceApp;
	env: AppEnv;
	/**
	 * Loads the app's own config, the runtime context and the plugin loader over them. Called only for an app that has
	 * something to sync, so an app with no config is never loaded.
	 */
	load: () => Promise<AppSyncLoad>;
	print?: (line: string) => void;
	/** The vault Environment of a layer in this repository (`resolveEnvironmentId`). */
	resolveEnvironment: (layer: string) => Promise<string>;
	/** Fans the vault's keys out (`runSecretsSync`). */
	syncSecrets: typeof runSecretsSync;
}

/** What {@link runAppSync} did. */
export interface AppSyncReport {
	/** `nothing` when the app has no destination for secrets. */
	status: "ok" | "fail" | "nothing";
	message: string;
}
