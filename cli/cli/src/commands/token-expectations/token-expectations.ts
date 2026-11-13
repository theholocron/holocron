import { ENVIRONMENT_LAYERS } from "../../credentials-environments/index.js";
import type { PluginToken } from "../auth/index.js";
import { DEFAULT_TOKEN_ROTATION } from "../token-rotation/index.js";
import type { LayerTokenExpectation, TokenExpectationFilter } from "./token-expectations.type.js";

/**
 * Reads what a plugin's tokens declare (`PluginToken.expect`) as one entry per token and layer that holds it, in the
 * order of `ENVIRONMENT_LAYERS`. The one reader the token probes, the doctor and the docs check share, so none of them
 * walks the declaration itself. A token with no `expect` yields nothing; a layer no token holds is never listed.
 */
export function tokenExpectations(
	tokens: readonly PluginToken[],
	filter: TokenExpectationFilter = {}
): LayerTokenExpectation[] {
	const found: LayerTokenExpectation[] = [];
	for (const token of tokens) {
		if (!token.expect || (filter.envName !== undefined && token.envName !== filter.envName)) continue;
		const { layers = [], permissions = {} } = token.expect;
		for (const layer of ENVIRONMENT_LAYERS) {
			if (filter.layer !== undefined && filter.layer !== layer) continue;
			const rules = permissions[layer];
			if (!rules && !layers.includes(layer)) continue;
			const entries = Object.entries(rules ?? {});
			found.push({
				envName: token.envName,
				layer,
				rules: rules ?? {},
				required: entries.filter(([, rule]) => rule === "required").map(([name]) => name),
				absent: entries.filter(([, rule]) => rule === "absent").map(([name]) => name),
				rotation: { ...DEFAULT_TOKEN_ROTATION, ...token.expect.rotation },
			});
		}
	}
	return found;
}
