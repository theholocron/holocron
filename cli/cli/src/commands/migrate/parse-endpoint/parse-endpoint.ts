import { ConfigError } from "../../../config/index.js";
import { parseOptionPairs } from "../../parse-option-pairs/index.js";
import type { Endpoint } from "./parse-endpoint.type.js";

/**
 * Reads `provider` or `provider:key=value,key=value` (`github:repo=theholocron/holocron`, `linear:team=ENG`) from
 * `--from` and `--to`. Values are text; a provider that wants more shape reads it from the config entry the options
 * are laid over.
 */
export function parseEndpoint(spec: string, flag = "--from"): Endpoint {
	const colon = spec.indexOf(":");
	const provider = (colon === -1 ? spec : spec.slice(0, colon)).trim();
	if (!/^[a-z][a-z0-9-]*$/.test(provider)) {
		throw new ConfigError(`${flag}: "${spec}" does not start with a provider name, e.g. github or linear:team=ENG`);
	}
	const rest = colon === -1 ? "" : spec.slice(colon + 1);
	return { provider, options: parseOptionPairs(rest, flag) };
}
