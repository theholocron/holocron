import type { EnvironmentLayer } from "../../credentials-environments/index.js";
import type { PermissionRule } from "../auth/index.js";

/** What one token must carry in one layer, as `tokenExpectations()` reads it from a plugin's `PluginToken.expect`. */
export interface LayerTokenExpectation {
	/** The token's plugin environment variable (`PluginToken.envName`), its identity in the plugin's list. */
	envName: string;
	/** The layer that holds it. */
	layer: EnvironmentLayer;
	/** Every permission with its rule. Empty for a layer that holds the token with no permission rules. */
	rules: Readonly<Record<string, PermissionRule>>;
	/** The permissions the token must have, in declaration order. */
	required: readonly string[];
	/** The permissions the token must not have, in declaration order. */
	absent: readonly string[];
}

/** Which of the declared expectations to return; both left out returns all of them. */
export interface TokenExpectationFilter {
	/** Only this layer. */
	layer?: string;
	/** Only the token with this `envName`. */
	envName?: string;
}
