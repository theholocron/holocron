/** A deployment target an app command writes to. */
export type AppTarget = "production" | "preview";

/** What an app command's `--env` means (spec `tool-app-deploy-sync`). */
export interface AppEnv {
	/** The vault layer the app's secrets are read from. */
	layer: "prod";
	/** The deployment targets to write to, production first. */
	targets: AppTarget[];
}
