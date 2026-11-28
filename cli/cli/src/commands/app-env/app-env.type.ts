/** A deployment target an app command writes to. */
export type AppTarget = "production" | "preview";

/** What an app command's `--env` means (spec `tool-app-deploy-sync`). */
export interface AppEnv {
	/** The deployment targets to write to, production first. Each reads its secrets from its own layer (`appLayer()`). */
	targets: AppTarget[];
}
