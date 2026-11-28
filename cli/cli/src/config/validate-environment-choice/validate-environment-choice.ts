import { ConfigError } from "@theholocron/kyber/config";

import { ENVIRONMENT_LAYERS, isEnvironmentLayer } from "../../credentials-environments/layer-environment/index.js";

/**
 * Check that an entry names its vault Environment one way: a literal `environment`, or a `layer` the name is derived
 * from (spec `tech-environment-layers`, #2069). Both together are an error, and so is a `layer` that is not a layer word
 * or an `environment` that is blank. With neither, the entry is an error unless `required` is false.
 *
 * @param entry - The `environment` and `layer` the entry sets.
 * @param what - How a message names the entry, e.g. "a `repo.secrets.deploy` entry".
 * @param required - Whether the entry must name one of the two. Default true.
 * @returns What the entry names (the environment, else the layer), for the rest of its messages; `undefined` for neither.
 * @throws {ConfigError} Naming the entry and the problem.
 */
export function validateEnvironmentChoice(
	entry: { environment?: unknown; layer?: unknown },
	what: string,
	required = true
): string | undefined {
	const { environment, layer } = entry;
	if (environment !== undefined && layer !== undefined) {
		throw new ConfigError(`${what} sets both \`layer\` and \`environment\`: name the Environment one way`);
	}
	if (layer !== undefined) {
		if (!isEnvironmentLayer(layer)) {
			throw new ConfigError(
				`${what} has \`layer\` ${JSON.stringify(layer)}: use ${ENVIRONMENT_LAYERS.map((l) => `"${l}"`).join(", ")}, or \`environment\` for a literal name`
			);
		}
		return layer;
	}
	if (environment !== undefined) {
		if (typeof environment !== "string" || environment.trim() === "") {
			throw new ConfigError(`${what} needs the name of a vault environment, got an empty \`environment\``);
		}
		return environment;
	}
	if (required) {
		throw new ConfigError(`${what} needs the name of a vault environment (\`environment\`) or a \`layer\``);
	}
	return undefined;
}
