import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { AppEnv } from "../app-env/index.js";
import type { BuildAppResult } from "../build-app/index.js";
import type { runDeployFromFiles } from "../deploy/index.js";
import type { StageDeployInput, StageDeployReport } from "../deploy-stage/deploy-stage.type.js";
import type { WorkspaceApp } from "../resolve-app/index.js";

/** What {@link RunAppDeployInput.load} gives back. */
export interface AppDeployLoad {
	/** The app's config, loaded in its own folder (the provider and its options come from it). */
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** The plugin loader over the app's config. */
	loader: PluginLoader;
}

/** Input to {@link runAppDeploy}. */
export interface RunAppDeployInput {
	app: WorkspaceApp;
	env: AppEnv;
	/**
	 * Loads the app's own config, the runtime context and the plugin loader over them. Called only for an app that has
	 * something to deploy, so an app with no config is never loaded.
	 */
	load: () => Promise<AppDeployLoad>;
	print?: (line: string) => void;
	/** Builds the app (`buildApp`). */
	build: (dir: string) => BuildAppResult;
	/** Stages the payload (`stageDeploy`). */
	stage: (input: StageDeployInput) => StageDeployReport;
	/** Deploys the staged files (`runDeployFromFiles`). */
	deployFiles: typeof runDeployFromFiles;
}

/** What {@link runAppDeploy} did. */
export interface AppDeployReport {
	/** `nothing` when the app has nothing to deploy, `dry-run` when it wrote nothing. */
	status: "ok" | "fail" | "dry-run" | "nothing";
	message: string;
}
