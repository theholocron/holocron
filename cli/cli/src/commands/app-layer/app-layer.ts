import type { EnvironmentLayer } from "../../credentials-environments/index.js";
import type { AppTarget } from "../app-env/index.js";

/**
 * The vault layer an app's secrets for a deployment target are read from: `production` reads `prod` and `preview` reads
 * its own `preview` layer, never `prod` (spec `tech-sentinel-preview-instance`), so a preview deployment is given only
 * what its own Environment holds.
 */
export function appLayer(target: AppTarget): EnvironmentLayer {
	return target === "production" ? "prod" : "preview";
}
