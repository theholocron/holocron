/** A stable release (no prerelease identifier) is on `main`, the default channel for a task. */
export const MAIN_CHANNEL = "main";
/** The flat id of the deploy task; a manifest may still spell it `delivery.deploy` (see `isTask`). */
export const DEPLOY_TASK = "deploy";
/** The package script the deploy runs, still the old task name until the packages' scripts are renamed (spec phase C). */
export const DEPLOY_SCRIPT = "delivery.deploy";
/** How long to wait for npm to serve the release's versions, and how often to ask. */
export const WAIT_TIMEOUT_MS = 5 * 60 * 1000;
export const WAIT_INTERVAL_MS = 10 * 1000;
