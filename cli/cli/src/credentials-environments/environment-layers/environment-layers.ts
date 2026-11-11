import type { Environment } from "@theholocron/env-utils/lookup";

import { type EnvironmentLayer, layerEnvironment } from "../layer-environment/index.js";
import type { EnvironmentCandidate } from "./environment-layers.type.js";

/** The suffix each layer's Environment carries: `<org/repo> - <suffix>`. `test` has none. */
const SUFFIX: Record<Exclude<Environment, "test">, EnvironmentLayer> = {
	local: "local",
	development: "dev",
	ci: "ci",
	production: "prod",
};

/**
 * The Environments a layer reads, in the order they are tried (#2063, #2058). A machine (`local`) reads
 * `<slug> - local` and then `<slug> - dev`: that is the only fallback there is. `development` reads `- dev`, `ci`
 * reads `- ci` and `production` reads `- prod`; a missing name is a missing name. `test` reads none. Only `- local`
 * is optional.
 */
export function environmentLayers(slug: string, layer: Environment): EnvironmentCandidate[] {
	if (layer === "test") return [];
	const candidate = (suffix: EnvironmentLayer, optional: boolean): EnvironmentCandidate => ({
		name: layerEnvironment(slug, suffix),
		optional,
		legacy: false,
	});
	return layer === "local"
		? [candidate(SUFFIX.local, true), candidate(SUFFIX.development, false)]
		: [candidate(SUFFIX[layer], false)];
}
